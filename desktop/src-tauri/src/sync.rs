//! Push and pull. Upload: ask which hashes are missing, PUT only those, 4 at a time, resumable,
//! then post the file_version. Download: fetch missing chunks with signed GET URLs, assemble to a
//! temp path, rename into place. Blender and UE5 never see a half-written file.
//! See docs/engineering.md, Storage and sync.

use std::collections::{BTreeMap, HashMap};
use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Instant;

use serde::Serialize;
use tokio::sync::Semaphore;

use crate::chunker::{chunk_file, ChunkRef};
use crate::client::{ChunkSpec, FileVersion, FileVersionBody, ServerClient};
use crate::error::{AgentError, Result};
use crate::ids::new_id;
use crate::ignore::AGENT_DIR;
use crate::index::{FileRow, Index};
use crate::queue;

pub const PARALLEL: usize = 4;
/// Chunks per upload-urls request. The server caps the batch at 2000.
const URL_BATCH: usize = 1000;
/// Chunks confirmed per /files/uploaded call. On an interrupted push at most this many
/// uploaded but unconfirmed chunks get re-sent.
const CONFIRM_BATCH: usize = 64;
const CURSOR_KEY: &str = "file_versions_cursor";
const QUEUE_FILE_VERSION: &str = "file_version";

#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize)]
pub struct PushReport {
    pub files: usize,
    pub chunks_total: usize,
    pub chunks_uploaded: usize,
    pub bytes_uploaded: u64,
    pub queue: queue::DrainReport,
    pub elapsed_ms: u128,
}

#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize)]
pub struct PullReport {
    pub files: usize,
    pub chunks_total: usize,
    pub chunks_downloaded: usize,
    pub chunks_reused_local: usize,
    pub bytes_downloaded: u64,
    /// Paths skipped because the local copy has unsent changes.
    pub conflicts: usize,
    pub elapsed_ms: u128,
}

fn read_chunk(path: &Path, c: &ChunkRef) -> Result<Vec<u8>> {
    let mut f = File::open(path).map_err(|e| AgentError::io(path, e))?;
    f.seek(SeekFrom::Start(c.offset))
        .map_err(|e| AgentError::io(path, e))?;
    let mut buf = vec![0u8; c.len as usize];
    f.read_exact(&mut buf)
        .map_err(|e| AgentError::io(path, e))?;
    Ok(buf)
}

/// Uploads every chunk of the unsynced files, then posts their file_versions through the queue.
pub async fn push(root: &Path, index: &Index, client: &ServerClient) -> Result<PushReport> {
    let started = Instant::now();
    let files = index.unsynced_files()?;
    let mut report = PushReport {
        files: files.len(),
        ..Default::default()
    };

    // Where each hash can be read from. One hash may appear in many files; read it once.
    let mut sources: BTreeMap<String, (PathBuf, ChunkRef)> = BTreeMap::new();
    for row in &files {
        for c in &row.chunks {
            report.chunks_total += 1;
            sources
                .entry(c.hash.clone())
                .or_insert_with(|| (root.join(&row.path), c.clone()));
        }
    }

    let specs: Vec<ChunkSpec> = sources
        .iter()
        .map(|(h, (_, c))| ChunkSpec {
            blake3: h.clone(),
            size: c.len,
        })
        .collect();
    let mut missing: Vec<(String, String)> = Vec::new();
    for batch in specs.chunks(URL_BATCH) {
        let res = client.upload_urls(batch).await?;
        missing.extend(res.missing.into_iter().map(|u| (u.blake3, u.url)));
    }
    tracing::info!(
        project_id = client.project_id(),
        files = files.len(),
        chunks = sources.len(),
        missing = missing.len(),
        "push: uploading"
    );

    let sem = Arc::new(Semaphore::new(PARALLEL));
    for batch in missing.chunks(CONFIRM_BATCH) {
        let mut tasks = Vec::new();
        for (hash, url) in batch {
            let (path, c) = sources.get(hash).cloned().ok_or_else(|| {
                AgentError::Config(format!("server asked for unknown chunk {hash}"))
            })?;
            let client = client.clone();
            let sem = Arc::clone(&sem);
            let url = url.clone();
            let hash = hash.clone();
            tasks.push(tokio::spawn(async move {
                let _permit = sem
                    .acquire()
                    .await
                    .map_err(|_| AgentError::Config("semaphore closed".into()))?;
                let bytes = tokio::task::spawn_blocking(move || read_chunk(&path, &c))
                    .await
                    .map_err(|e| AgentError::Config(format!("read task failed: {e}")))??;
                let actual = crate::chunker::hash_bytes(&bytes);
                if actual != hash {
                    // The file changed under us. The next scan picks it up.
                    return Err(AgentError::HashMismatch {
                        path: url.clone(),
                        expected: hash,
                        actual,
                    });
                }
                let len = bytes.len() as u64;
                client.put_chunk(&url, bytes).await?;
                Ok::<u64, AgentError>(len)
            }));
        }
        for t in tasks {
            let len = t
                .await
                .map_err(|e| AgentError::Config(format!("upload task failed: {e}")))??;
            report.chunks_uploaded += 1;
            report.bytes_uploaded += len;
        }
        let confirm: Vec<ChunkSpec> = batch
            .iter()
            .map(|(h, _)| ChunkSpec {
                blake3: h.clone(),
                size: sources[h].1.len,
            })
            .collect();
        let res = client.uploaded(&confirm).await?;
        if !res.missing.is_empty() {
            return Err(AgentError::Config(format!(
                "store did not keep {} chunks, first {}",
                res.missing.len(),
                res.missing[0]
            )));
        }
    }

    // Every chunk is in the store. Record the file versions in order through the queue.
    for row in &files {
        let body = FileVersionBody {
            id: new_id(),
            path: row.path.clone(),
            size: row.size,
            blake3: row.blake3.clone(),
            chunk_hashes: row.chunks.iter().map(|c| c.hash.clone()).collect(),
        };
        queue::enqueue(index, QUEUE_FILE_VERSION, &body)?;
    }
    report.queue = drain_queue(index, client).await?;
    report.elapsed_ms = started.elapsed().as_millis();
    tracing::info!(
        project_id = client.project_id(),
        chunks_uploaded = report.chunks_uploaded,
        bytes_uploaded = report.bytes_uploaded,
        elapsed_ms = report.elapsed_ms,
        "push: done"
    );
    Ok(report)
}

/// Sends queued writes in order. Safe to call any time; a no-op when the queue is empty.
pub async fn drain_queue(index: &Index, client: &ServerClient) -> Result<queue::DrainReport> {
    queue::drain(index, |item| async move {
        if item.kind != QUEUE_FILE_VERSION {
            tracing::warn!(kind = item.kind, "unknown queue item kind");
            return Ok(());
        }
        let body: FileVersionBody = queue::decode(&item)?;
        let saved = client.post_file_version(&body).await?;
        // Only mark synced if the file on disk is still the bytes we sent.
        if let Some(row) = index.get_file(&body.path)? {
            if row.blake3 == body.blake3 {
                index.set_synced(&body.path, &saved.id)?;
            }
        }
        Ok(())
    })
    .await
}

/// Newest version per path from the server since the last cursor. Updates the cursor.
async fn fetch_remote(
    index: &Index,
    client: &ServerClient,
) -> Result<BTreeMap<String, FileVersion>> {
    let mut cursor = index.get_meta(CURSOR_KEY)?;
    let mut latest: BTreeMap<String, FileVersion> = BTreeMap::new();
    loop {
        let page = client.list_file_versions(cursor.as_deref(), 1000).await?;
        for fv in page.file_versions {
            latest.insert(fv.path.clone(), fv);
        }
        cursor = page.next.or(cursor);
        if !page.more {
            break;
        }
    }
    if let Some(c) = &cursor {
        index.set_meta(CURSOR_KEY, c)?;
    }
    Ok(latest)
}

/// Downloads what is new on the server. Reuses chunks that already exist in any local file.
/// Room kept free on the disk after a pull, so the system and Blender still have space to work.
pub const DISK_RESERVE: u64 = 1024 * 1024 * 1024;

/// A pull fits when what it writes plus the reserve is within what the disk has free.
pub fn room_for(needed: u64, available: u64) -> Result<()> {
    if needed.saturating_add(DISK_RESERVE) > available {
        return Err(AgentError::NoSpace {
            needed: needed.saturating_add(DISK_RESERVE),
            available,
        });
    }
    Ok(())
}

/// A byte count as a person reads it: 900 MB, 3.2 GB.
pub fn size_words(bytes: u64) -> String {
    const GB: f64 = 1_000_000_000.0;
    const MB: f64 = 1_000_000.0;
    let b = bytes as f64;
    if b >= GB {
        format!("{:.1} GB", b / GB)
    } else {
        format!("{} MB", (b / MB).ceil() as u64)
    }
}

pub async fn pull(root: &Path, index: &Index, client: &ServerClient) -> Result<PullReport> {
    let started = Instant::now();
    let mut report = PullReport::default();
    let remote = fetch_remote(index, client).await?;

    let mut todo: Vec<FileVersion> = Vec::new();
    for (path, fv) in remote {
        match index.get_file(&path)? {
            Some(local) if local.blake3 == fv.blake3 => {
                if local.remote_version_id.as_deref() != Some(&fv.id) {
                    index.set_synced(&path, &fv.id)?;
                }
            }
            Some(local) if local.synced_version_id.is_none() => {
                tracing::warn!(
                    project_id = client.project_id(),
                    path,
                    "pull: local changes not sent yet, skipped"
                );
                report.conflicts += 1;
            }
            _ => todo.push(fv),
        }
    }
    report.files = todo.len();
    if todo.is_empty() {
        report.elapsed_ms = started.elapsed().as_millis();
        return Ok(report);
    }
    // Each file is written whole to tmp, then moved in place: the sizes are what the disk needs.
    // https://docs.rs/fs4/latest/fs4/fn.available_space.html
    let needed: u64 = todo.iter().map(|fv| fv.size).sum();
    let available = fs4::available_space(root).map_err(|e| AgentError::io(root, e))?;
    room_for(needed, available)?;

    // Local chunk sources, so an edit downloads only what changed.
    let mut local: HashMap<String, (PathBuf, ChunkRef)> = HashMap::new();
    for row in index.all_files()? {
        for c in &row.chunks {
            local
                .entry(c.hash.clone())
                .or_insert_with(|| (root.join(&row.path), c.clone()));
        }
    }

    let tmp_dir = root.join(AGENT_DIR).join("tmp");
    fs::create_dir_all(&tmp_dir).map_err(|e| AgentError::io(&tmp_dir, e))?;
    let sem = Arc::new(Semaphore::new(PARALLEL));

    for fv in todo {
        let needed: Vec<String> = fv
            .chunk_hashes
            .iter()
            .filter(|h| !local.contains_key(*h))
            .cloned()
            .collect();
        report.chunks_total += fv.chunk_hashes.len();
        report.chunks_reused_local += fv.chunk_hashes.len() - needed.len();
        let mut urls: HashMap<String, String> = HashMap::new();
        for batch in needed.chunks(URL_BATCH) {
            let res = client.download_urls(batch).await?;
            for u in res.urls {
                urls.insert(u.blake3, u.url);
            }
        }
        tracing::info!(
            project_id = client.project_id(),
            path = fv.path,
            chunks = fv.chunk_hashes.len(),
            download = needed.len(),
            "pull: assembling"
        );

        let tmp_path = tmp_dir.join(new_id());
        let mut out = File::create(&tmp_path).map_err(|e| AgentError::io(&tmp_path, e))?;
        let mut whole = blake3::Hasher::new();
        // Download in windows of PARALLEL * 4 so memory stays bounded, write in order.
        for window in fv.chunk_hashes.chunks(PARALLEL * 4) {
            let mut tasks = Vec::new();
            for hash in window {
                let hash = hash.clone();
                if let Some((path, c)) = local.get(&hash).cloned() {
                    tasks.push(tokio::task::spawn_blocking(move || {
                        let bytes = read_chunk(&path, &c)?;
                        if crate::chunker::hash_bytes(&bytes) != hash {
                            return Err(AgentError::HashMismatch {
                                path: path.display().to_string(),
                                expected: hash,
                                actual: "local file changed".into(),
                            });
                        }
                        Ok::<(Vec<u8>, bool), AgentError>((bytes, false))
                    }));
                } else {
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
                        let bytes = client.get_chunk(&url, &hash).await?;
                        Ok((bytes, true))
                    }));
                }
            }
            for t in tasks {
                let (bytes, downloaded) = t
                    .await
                    .map_err(|e| AgentError::Config(format!("download task failed: {e}")))??;
                if downloaded {
                    report.chunks_downloaded += 1;
                    report.bytes_downloaded += bytes.len() as u64;
                }
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
        let dest = root.join(&fv.path);
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent).map_err(|e| AgentError::io(parent, e))?;
        }
        fs::rename(&tmp_path, &dest).map_err(|e| AgentError::io(&dest, e))?;

        let fc = chunk_file(&dest)?;
        let meta = fs::metadata(&dest).map_err(|e| AgentError::io(&dest, e))?;
        let mtime = crate::scan::mtime_ns(&meta);
        for c in &fc.chunks {
            local
                .entry(c.hash.clone())
                .or_insert_with(|| (dest.clone(), c.clone()));
        }
        index.upsert_file(&FileRow {
            path: fv.path.clone(),
            size: fc.size,
            mtime_ns: mtime,
            blake3: fc.blake3,
            chunks: fc.chunks,
            synced_version_id: Some(fv.id.clone()),
            remote_version_id: Some(fv.id.clone()),
        })?;
    }
    report.elapsed_ms = started.elapsed().as_millis();
    tracing::info!(
        project_id = client.project_id(),
        files = report.files,
        chunks_downloaded = report.chunks_downloaded,
        bytes_downloaded = report.bytes_downloaded,
        elapsed_ms = report.elapsed_ms,
        "pull: done"
    );
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_pull_needs_its_bytes_and_the_reserve_free() {
        assert!(room_for(500_000_000, DISK_RESERVE + 500_000_000).is_ok());
        let err = room_for(3_200_000_000, 2_000_000_000).unwrap_err();
        assert!(matches!(err, AgentError::NoSpace { .. }));
        assert_eq!(
            err.to_string(),
            "Not enough space on this computer: the project needs 2.3 GB more. Free some space; it catches up by itself."
        );
        assert_eq!(size_words(900_000_000), "900 MB");
        assert_eq!(size_words(1_000_001), "2 MB");
    }
}
