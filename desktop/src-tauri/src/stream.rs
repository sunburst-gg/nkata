//! Stream mode for a viewer. No index, no watcher, no upload. Files are fetched on demand
//! through `/files/download-urls` into `~/.nkata/<project>/cache/`, capped at 5 GB, least
//! recently used evicted first. See docs/engineering.md, Storage and sync, Stream mode.
//!
//! The cache is a SQLite table next to the files. Eviction runs after every download until the
//! total is under the cap. A row whose file is gone on disk is dropped on the next lookup.

use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use tokio::sync::Semaphore;

use crate::client::{FileVersion, ServerClient};
use crate::error::{AgentError, Result};
use crate::ids::new_id;

pub const DEFAULT_CAP_BYTES: u64 = 5 * 1024 * 1024 * 1024;
pub const DB_FILE: &str = "cache.db";
const FILES_DIR: &str = "files";
const TMP_DIR: &str = "tmp";
const URL_BATCH: usize = 1000;
const PARALLEL: usize = 4;
const RETRIES: u32 = 3;
const RETRY_DELAY: std::time::Duration = std::time::Duration::from_millis(500);

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CachedFile {
    pub file_version_id: String,
    pub path: String,
    pub size: u64,
    /// Order of last use. Higher is more recent.
    pub seq: i64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct FetchReport {
    pub path: PathBuf,
    pub downloaded: bool,
    pub bytes_downloaded: u64,
    pub evicted: Vec<String>,
    pub total_bytes: u64,
}

/// Saved by `init --stream` so `serve --stream` and `fetch` need no project folder.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StreamConfig {
    pub server_url: String,
    pub token: String,
    pub project_id: String,
}

pub struct StreamCache {
    root: PathBuf,
    conn: Connection,
    cap: u64,
}

/// `~/.nkata/<project_id>/cache`. NKATA_HOME replaces `~/.nkata` for tests.
pub fn default_root(project_id: &str) -> PathBuf {
    let home = std::env::var_os("NKATA_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            std::env::var_os("HOME")
                .or_else(|| std::env::var_os("USERPROFILE"))
                .map(PathBuf::from)
                .unwrap_or_else(|| PathBuf::from("."))
                .join(".nkata")
        });
    home.join(project_id).join("cache")
}

impl StreamCache {
    pub fn open(root: &Path, cap: u64) -> Result<Self> {
        for sub in [FILES_DIR, TMP_DIR] {
            let dir = root.join(sub);
            fs::create_dir_all(&dir).map_err(|e| AgentError::io(&dir, e))?;
        }
        let db = root.join(DB_FILE);
        let conn = Connection::open(&db)?;
        conn.execute_batch(
            "pragma journal_mode = wal;
             create table if not exists meta (key text primary key, value text not null);
             create table if not exists cache_file (
               file_version_id text primary key,
               path text not null,
               size integer not null,
               seq integer not null
             );
             create index if not exists cache_file_seq on cache_file (seq);",
        )?;
        Ok(Self {
            root: root.to_path_buf(),
            conn,
            cap,
        })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn cap(&self) -> u64 {
        self.cap
    }

    pub fn save_config(&self, config: &StreamConfig) -> Result<()> {
        for (k, v) in [
            ("server_url", &config.server_url),
            ("token", &config.token),
            ("project_id", &config.project_id),
        ] {
            self.conn.execute(
                "insert into meta (key, value) values (?1, ?2) on conflict(key) do update set value = excluded.value",
                params![k, v],
            )?;
        }
        Ok(())
    }

    pub fn load_config(&self) -> Result<StreamConfig> {
        let get = |k: &str| -> Result<String> {
            self.conn
                .query_row("select value from meta where key = ?1", [k], |r| r.get(0))
                .optional()?
                .ok_or_else(|| {
                    AgentError::Config(format!(
                        "stream cache not initialised: missing {k}. Run init --stream first."
                    ))
                })
        };
        Ok(StreamConfig {
            server_url: get("server_url")?,
            token: get("token")?,
            project_id: get("project_id")?,
        })
    }

    pub fn total_bytes(&self) -> Result<u64> {
        let total: i64 =
            self.conn
                .query_row("select coalesce(sum(size), 0) from cache_file", [], |r| {
                    r.get(0)
                })?;
        Ok(total as u64)
    }

    /// Every cached file, least recently used first.
    pub fn entries(&self) -> Result<Vec<CachedFile>> {
        let mut stmt = self
            .conn
            .prepare("select file_version_id, path, size, seq from cache_file order by seq")?;
        let rows = stmt.query_map([], |r| {
            Ok(CachedFile {
                file_version_id: r.get(0)?,
                path: r.get(1)?,
                size: r.get::<_, i64>(2)? as u64,
                seq: r.get(3)?,
            })
        })?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    }

    /// Where a file version lives in the cache: `files/<file_version_id>/<file name>`.
    pub fn file_path(&self, file_version_id: &str, rel_path: &str) -> PathBuf {
        let name = Path::new(rel_path)
            .file_name()
            .map(|n| n.to_os_string())
            .unwrap_or_else(|| "file".into());
        self.root.join(FILES_DIR).join(file_version_id).join(name)
    }

    /// The cached path if present. Marks it as used now. Drops the row if the file is gone.
    pub fn get(&self, file_version_id: &str) -> Result<Option<PathBuf>> {
        let row: Option<String> = self
            .conn
            .query_row(
                "select path from cache_file where file_version_id = ?1",
                [file_version_id],
                |r| r.get(0),
            )
            .optional()?;
        let Some(rel) = row else {
            return Ok(None);
        };
        let path = self.file_path(file_version_id, &rel);
        if !path.is_file() {
            tracing::warn!(
                file_version_id,
                "stream cache: file missing on disk, row dropped"
            );
            self.conn.execute(
                "delete from cache_file where file_version_id = ?1",
                [file_version_id],
            )?;
            return Ok(None);
        }
        self.touch(file_version_id)?;
        Ok(Some(path))
    }

    fn next_seq(&self) -> Result<i64> {
        let max: i64 =
            self.conn
                .query_row("select coalesce(max(seq), 0) from cache_file", [], |r| {
                    r.get(0)
                })?;
        Ok(max + 1)
    }

    fn touch(&self, file_version_id: &str) -> Result<()> {
        let seq = self.next_seq()?;
        self.conn.execute(
            "update cache_file set seq = ?2 where file_version_id = ?1",
            params![file_version_id, seq],
        )?;
        Ok(())
    }

    /// Records a file that is already at `file_path(id, rel_path)`.
    pub fn record(&self, file_version_id: &str, rel_path: &str, size: u64) -> Result<()> {
        let seq = self.next_seq()?;
        self.conn.execute(
            "insert into cache_file (file_version_id, path, size, seq) values (?1, ?2, ?3, ?4)
             on conflict(file_version_id) do update set path = excluded.path, size = excluded.size, seq = excluded.seq",
            params![file_version_id, rel_path, size as i64, seq],
        )?;
        Ok(())
    }

    /// Removes least recently used files until the total is at or under the cap.
    /// Returns the evicted file version ids, oldest first.
    pub fn evict(&self) -> Result<Vec<String>> {
        let mut evicted = Vec::new();
        let mut total = self.total_bytes()?;
        while total > self.cap {
            let oldest: Option<(String, String, i64)> = self
                .conn
                .query_row(
                    "select file_version_id, path, size from cache_file order by seq limit 1",
                    [],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
                )
                .optional()?;
            let Some((id, rel, size)) = oldest else {
                break;
            };
            let path = self.file_path(&id, &rel);
            if path.exists() {
                fs::remove_file(&path).map_err(|e| AgentError::io(&path, e))?;
            }
            if let Some(dir) = path.parent() {
                let _ = fs::remove_dir(dir);
            }
            self.conn
                .execute("delete from cache_file where file_version_id = ?1", [&id])?;
            total = total.saturating_sub(size as u64);
            tracing::info!(file_version_id = id, size, total, "stream cache: evicted");
            evicted.push(id);
        }
        Ok(evicted)
    }

    /// The file for a version: from the cache, or downloaded, verified, recorded, then evicted
    /// down to the cap.
    pub async fn fetch(&self, client: &ServerClient, fv: &FileVersion) -> Result<FetchReport> {
        if let Some(path) = self.get(&fv.id)? {
            return Ok(FetchReport {
                path,
                downloaded: false,
                bytes_downloaded: 0,
                evicted: Vec::new(),
                total_bytes: self.total_bytes()?,
            });
        }
        let dest = self.file_path(&fv.id, &fv.path);
        let bytes = download_file(client, fv, &self.root.join(TMP_DIR), &dest).await?;
        self.record(&fv.id, &fv.path, fv.size)?;
        let evicted = self.evict()?;
        Ok(FetchReport {
            path: dest,
            downloaded: true,
            bytes_downloaded: bytes,
            evicted,
            total_bytes: self.total_bytes()?,
        })
    }
}

/// A viewer waits a moment on a store or network blip instead of failing the open.
async fn get_chunk_with_retry(client: &ServerClient, url: &str, hash: &str) -> Result<Vec<u8>> {
    let mut attempt = 0u32;
    loop {
        match client.get_chunk(url, hash).await {
            Ok(bytes) => return Ok(bytes),
            Err(e) if e.is_offline() && attempt < RETRIES => {
                attempt += 1;
                tracing::warn!(attempt, error = %e, "stream cache: chunk download failed, retrying");
                tokio::time::sleep(RETRY_DELAY * attempt).await;
            }
            Err(e) => return Err(e),
        }
    }
}

/// Downloads every chunk of a file version, 4 at a time, writes them in order to a temp file,
/// checks the whole file hash, and renames into place. Returns the bytes downloaded.
async fn download_file(
    client: &ServerClient,
    fv: &FileVersion,
    tmp_dir: &Path,
    dest: &Path,
) -> Result<u64> {
    let mut urls = std::collections::HashMap::new();
    for batch in fv.chunk_hashes.chunks(URL_BATCH) {
        let res = client.download_urls(batch).await?;
        for u in res.urls {
            urls.insert(u.blake3, u.url);
        }
    }
    let tmp_path = tmp_dir.join(new_id());
    let mut out = File::create(&tmp_path).map_err(|e| AgentError::io(&tmp_path, e))?;
    let mut whole = blake3::Hasher::new();
    let mut downloaded = 0u64;
    let sem = Arc::new(Semaphore::new(PARALLEL));
    for window in fv.chunk_hashes.chunks(PARALLEL * 4) {
        let mut tasks = Vec::new();
        for hash in window {
            let hash = hash.clone();
            let url = urls
                .get(&hash)
                .cloned()
                .ok_or_else(|| AgentError::Config(format!("no download url for {hash}")))?;
            let client = client.clone();
            let sem = Arc::clone(&sem);
            tasks.push(tokio::spawn(async move {
                let _permit = sem
                    .acquire()
                    .await
                    .map_err(|_| AgentError::Config("semaphore closed".into()))?;
                get_chunk_with_retry(&client, &url, &hash).await
            }));
        }
        for t in tasks {
            let bytes = t
                .await
                .map_err(|e| AgentError::Config(format!("download task failed: {e}")))??;
            downloaded += bytes.len() as u64;
            whole.update(&bytes);
            out.write_all(&bytes)
                .map_err(|e| AgentError::io(&tmp_path, e))?;
        }
    }
    out.sync_all().map_err(|e| AgentError::io(&tmp_path, e))?;
    drop(out);
    let actual = whole.finalize().to_hex().to_string();
    if actual != fv.blake3 {
        let _ = fs::remove_file(&tmp_path);
        return Err(AgentError::HashMismatch {
            path: fv.path.clone(),
            expected: fv.blake3.clone(),
            actual,
        });
    }
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| AgentError::io(parent, e))?;
    }
    fs::rename(&tmp_path, dest).map_err(|e| AgentError::io(dest, e))?;
    tracing::info!(
        project_id = client.project_id(),
        file_version_id = fv.id,
        path = fv.path,
        bytes = downloaded,
        "stream cache: downloaded"
    );
    Ok(downloaded)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn put(cache: &StreamCache, id: &str, size: u64) {
        let path = cache.file_path(id, &format!("Textures/{id}.png"));
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, vec![0u8; size as usize]).unwrap();
        cache
            .record(id, &format!("Textures/{id}.png"), size)
            .unwrap();
    }

    #[test]
    fn evicts_least_recently_used_until_under_the_cap() {
        let dir = tempfile::tempdir().unwrap();
        let cache = StreamCache::open(dir.path(), 250).unwrap();
        put(&cache, "a", 100);
        put(&cache, "b", 100);
        put(&cache, "c", 100);
        // a is the oldest. Using it makes b the oldest.
        assert!(cache.get("a").unwrap().is_some());
        let evicted = cache.evict().unwrap();
        assert_eq!(evicted, vec!["b".to_string()]);
        assert_eq!(cache.total_bytes().unwrap(), 200);
        assert!(cache.total_bytes().unwrap() <= cache.cap());
        let ids: Vec<String> = cache
            .entries()
            .unwrap()
            .into_iter()
            .map(|e| e.file_version_id)
            .collect();
        assert_eq!(ids, vec!["c".to_string(), "a".to_string()]);
        assert!(!cache.file_path("b", "Textures/b.png").exists());
    }

    #[test]
    fn evicts_several_when_one_big_file_lands() {
        let dir = tempfile::tempdir().unwrap();
        let cache = StreamCache::open(dir.path(), 300).unwrap();
        put(&cache, "a", 100);
        put(&cache, "b", 100);
        put(&cache, "c", 100);
        put(&cache, "big", 250);
        let evicted = cache.evict().unwrap();
        assert_eq!(
            evicted,
            vec!["a".to_string(), "b".to_string(), "c".to_string()]
        );
        assert_eq!(cache.total_bytes().unwrap(), 250);
    }

    #[test]
    fn a_missing_file_drops_its_row() {
        let dir = tempfile::tempdir().unwrap();
        let cache = StreamCache::open(dir.path(), 1000).unwrap();
        put(&cache, "a", 10);
        fs::remove_file(cache.file_path("a", "Textures/a.png")).unwrap();
        assert!(cache.get("a").unwrap().is_none());
        assert_eq!(cache.total_bytes().unwrap(), 0);
    }

    #[test]
    fn config_round_trips_and_default_root_follows_nkata_home() {
        let dir = tempfile::tempdir().unwrap();
        let cache = StreamCache::open(dir.path(), DEFAULT_CAP_BYTES).unwrap();
        assert!(cache.load_config().is_err());
        let config = StreamConfig {
            server_url: "http://127.0.0.1:7401".into(),
            token: "t".into(),
            project_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV".into(),
        };
        cache.save_config(&config).unwrap();
        assert_eq!(cache.load_config().unwrap(), config);
        let root = default_root("P");
        assert!(root.ends_with(Path::new("P").join("cache")));
    }
}
