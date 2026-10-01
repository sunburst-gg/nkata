//! Local index in SQLite: path, size, mtime, blake3, chunk list, last synced version.
//! The index is the truth about local state. See docs/engineering.md, Storage and sync, Index.
//! rusqlite: https://docs.rs/rusqlite

use std::path::Path;

use rusqlite::{params, Connection, OptionalExtension};

use crate::chunker::ChunkRef;
use crate::error::Result;

const SCHEMA: &str = "
create table if not exists meta (
  key text primary key,
  value text not null
);
create table if not exists files (
  path text primary key,
  size integer not null,
  mtime_ns integer not null,
  blake3 text not null,
  chunks text not null,
  synced_version_id text,
  remote_version_id text
);
create index if not exists files_unsynced_idx on files (synced_version_id) where synced_version_id is null;
create table if not exists queue (
  id integer primary key autoincrement,
  kind text not null,
  payload text not null,
  attempts integer not null default 0,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileRow {
    pub path: String,
    pub size: u64,
    /// Nanoseconds since the Unix epoch. Fits i64 until the year 2262.
    pub mtime_ns: i64,
    pub blake3: String,
    pub chunks: Vec<ChunkRef>,
    /// Id of the file_version on the server that matches these bytes, when uploaded.
    pub synced_version_id: Option<String>,
    /// Newest file_version id seen from the server for this path.
    pub remote_version_id: Option<String>,
}

pub struct Index {
    conn: Connection,
}

impl Index {
    pub fn open(path: &Path) -> Result<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| crate::error::AgentError::io(parent, e))?;
        }
        let conn = Connection::open(path)?;
        conn.execute_batch("pragma journal_mode = wal; pragma synchronous = normal;")?;
        conn.execute_batch(SCHEMA)?;
        Ok(Self { conn })
    }

    pub fn open_in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        conn.execute_batch(SCHEMA)?;
        Ok(Self { conn })
    }

    pub fn conn(&self) -> &Connection {
        &self.conn
    }

    pub fn get_meta(&self, key: &str) -> Result<Option<String>> {
        Ok(self
            .conn
            .query_row("select value from meta where key = ?1", [key], |r| r.get(0))
            .optional()?)
    }

    pub fn set_meta(&self, key: &str, value: &str) -> Result<()> {
        self.conn.execute(
            "insert into meta (key, value) values (?1, ?2) on conflict(key) do update set value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }

    pub fn get_file(&self, path: &str) -> Result<Option<FileRow>> {
        self.conn
            .query_row(
                "select path, size, mtime_ns, blake3, chunks, synced_version_id, remote_version_id from files where path = ?1",
                [path],
                row_to_file,
            )
            .optional()
            .map_err(Into::into)
            .and_then(|r| r.transpose())
    }

    pub fn upsert_file(&self, row: &FileRow) -> Result<()> {
        self.conn.execute(
            "insert into files (path, size, mtime_ns, blake3, chunks, synced_version_id, remote_version_id)
             values (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             on conflict(path) do update set size = excluded.size, mtime_ns = excluded.mtime_ns, blake3 = excluded.blake3,
               chunks = excluded.chunks, synced_version_id = excluded.synced_version_id, remote_version_id = excluded.remote_version_id",
            params![
                row.path,
                row.size as i64,
                row.mtime_ns,
                row.blake3,
                serde_json::to_string(&row.chunks)?,
                row.synced_version_id,
                row.remote_version_id
            ],
        )?;
        Ok(())
    }

    pub fn set_synced(&self, path: &str, version_id: &str) -> Result<()> {
        self.conn.execute(
            "update files set synced_version_id = ?2, remote_version_id = ?2 where path = ?1",
            params![path, version_id],
        )?;
        Ok(())
    }

    pub fn remove_file(&self, path: &str) -> Result<()> {
        self.conn
            .execute("delete from files where path = ?1", [path])?;
        Ok(())
    }

    pub fn all_files(&self) -> Result<Vec<FileRow>> {
        let mut stmt = self
            .conn
            .prepare("select path, size, mtime_ns, blake3, chunks, synced_version_id, remote_version_id from files order by path")?;
        let rows = stmt.query_map([], row_to_file)?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r??);
        }
        Ok(out)
    }

    pub fn unsynced_files(&self) -> Result<Vec<FileRow>> {
        let mut stmt = self.conn.prepare(
            "select path, size, mtime_ns, blake3, chunks, synced_version_id, remote_version_id from files where synced_version_id is null order by path",
        )?;
        let rows = stmt.query_map([], row_to_file)?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r??);
        }
        Ok(out)
    }

    /// Paths under a folder prefix ("" for the whole project).
    pub fn files_under(&self, prefix: &str) -> Result<Vec<FileRow>> {
        if prefix.is_empty() {
            return self.all_files();
        }
        let like = format!("{}/%", prefix.trim_end_matches('/'));
        let mut stmt = self.conn.prepare(
            "select path, size, mtime_ns, blake3, chunks, synced_version_id, remote_version_id from files where path like ?1 order by path",
        )?;
        let rows = stmt.query_map([like], row_to_file)?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r??);
        }
        Ok(out)
    }
}

type RowResult = std::result::Result<Result<FileRow>, rusqlite::Error>;

fn row_to_file(r: &rusqlite::Row<'_>) -> RowResult {
    let chunks_json: String = r.get(4)?;
    Ok((|| {
        Ok(FileRow {
            path: r.get(0)?,
            size: r.get::<_, i64>(1)? as u64,
            mtime_ns: r.get(2)?,
            blake3: r.get(3)?,
            chunks: serde_json::from_str(&chunks_json)?,
            synced_version_id: r.get(5)?,
            remote_version_id: r.get(6)?,
        })
    })())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(path: &str) -> FileRow {
        FileRow {
            path: path.to_string(),
            size: 10,
            mtime_ns: 1_700_000_000_000_000_000,
            blake3: "ab".repeat(32),
            chunks: vec![ChunkRef {
                hash: "cd".repeat(32),
                offset: 0,
                len: 10,
            }],
            synced_version_id: None,
            remote_version_id: None,
        }
    }

    #[test]
    fn upsert_get_and_sync_state() {
        let idx = Index::open_in_memory().unwrap();
        idx.upsert_file(&row("a/b.blend")).unwrap();
        idx.upsert_file(&row("c.txt")).unwrap();
        assert_eq!(
            idx.get_file("a/b.blend").unwrap().unwrap(),
            row("a/b.blend")
        );
        assert_eq!(idx.unsynced_files().unwrap().len(), 2);
        idx.set_synced("a/b.blend", "01ARZ3NDEKTSV4RRFFQ69G5FAV")
            .unwrap();
        assert_eq!(idx.unsynced_files().unwrap().len(), 1);
        assert_eq!(idx.files_under("a").unwrap().len(), 1);
        assert_eq!(idx.files_under("").unwrap().len(), 2);
        idx.remove_file("c.txt").unwrap();
        assert!(idx.get_file("c.txt").unwrap().is_none());
        idx.set_meta("cursor", "x").unwrap();
        assert_eq!(idx.get_meta("cursor").unwrap().as_deref(), Some("x"));
        assert_eq!(idx.get_meta("nope").unwrap(), None);
    }
}
