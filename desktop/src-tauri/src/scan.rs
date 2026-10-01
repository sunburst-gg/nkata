//! Rescan: walk the folder, read mtime and size first, hash only files that changed.
//! Full rescan on start and every 10 minutes; the watcher wakes a rescan of one folder.
//! See docs/engineering.md, Storage and sync, Index.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::{Instant, UNIX_EPOCH};

use serde::Serialize;
use walkdir::WalkDir;

use crate::chunker::chunk_file;
use crate::error::{AgentError, Result};
use crate::ignore::IgnoreRules;
use crate::index::{FileRow, Index};

#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize)]
pub struct ScanReport {
    pub scanned: usize,
    pub unchanged: usize,
    pub hashed: usize,
    pub hashed_bytes: u64,
    pub removed: usize,
    pub elapsed_ms: u128,
}

/// Path relative to root with forward slashes, the form the index and the server use.
pub fn rel_path(root: &Path, path: &Path) -> Option<String> {
    let rel = path.strip_prefix(root).ok()?;
    let parts: Vec<&str> = rel
        .components()
        .filter_map(|c| match c {
            std::path::Component::Normal(n) => n.to_str(),
            _ => None,
        })
        .collect();
    if parts.is_empty() {
        None
    } else {
        Some(parts.join("/"))
    }
}

pub fn mtime_ns(meta: &std::fs::Metadata) -> i64 {
    meta.modified()
        .ok()
        .and_then(|m| m.duration_since(UNIX_EPOCH).ok())
        .and_then(|d| i64::try_from(d.as_nanos()).ok())
        .unwrap_or(0)
}

/// Scans `root/sub` (the whole project when `sub` is empty). Updates the index in place.
pub fn scan(root: &Path, sub: &str, index: &Index, rules: &IgnoreRules) -> Result<ScanReport> {
    let started = Instant::now();
    let start: PathBuf = if sub.is_empty() {
        root.to_path_buf()
    } else {
        root.join(sub)
    };
    let mut report = ScanReport::default();
    let mut seen: HashSet<String> = HashSet::new();

    if start.is_dir() {
        let walker = WalkDir::new(&start).follow_links(false).into_iter();
        for entry in walker.filter_entry(|e| {
            let rel = match e.path().strip_prefix(root) {
                Ok(r) => r,
                Err(_) => return true,
            };
            rel.as_os_str().is_empty() || !rules.is_ignored(rel, e.file_type().is_dir())
        }) {
            let entry = match entry {
                Ok(e) => e,
                Err(e) => {
                    tracing::warn!(error = %e, "walk error, skipped");
                    continue;
                }
            };
            if !entry.file_type().is_file() {
                continue;
            }
            let Some(rel) = rel_path(root, entry.path()) else {
                continue;
            };
            let meta = entry
                .metadata()
                .map_err(|e| AgentError::io(entry.path(), e.into()))?;
            report.scanned += 1;
            seen.insert(rel.clone());
            let size = meta.len();
            let mtime = mtime_ns(&meta);
            if let Some(existing) = index.get_file(&rel)? {
                if existing.size == size && existing.mtime_ns == mtime {
                    report.unchanged += 1;
                    continue;
                }
            }
            let fc = chunk_file(entry.path())?;
            report.hashed += 1;
            report.hashed_bytes += fc.size;
            // Keep the remote pointer; a changed file is unsynced until push.
            let previous = index.get_file(&rel)?;
            let same_bytes = previous.as_ref().is_some_and(|p| p.blake3 == fc.blake3);
            index.upsert_file(&FileRow {
                path: rel,
                size: fc.size,
                mtime_ns: mtime,
                blake3: fc.blake3,
                chunks: fc.chunks,
                synced_version_id: if same_bytes {
                    previous.as_ref().and_then(|p| p.synced_version_id.clone())
                } else {
                    None
                },
                remote_version_id: previous.and_then(|p| p.remote_version_id),
            })?;
        }
    }

    // Rows under this folder that are gone from disk.
    for row in index.files_under(sub)? {
        if !seen.contains(&row.path) && !root.join(&row.path).is_file() {
            index.remove_file(&row.path)?;
            report.removed += 1;
        }
    }
    report.elapsed_ms = started.elapsed().as_millis();
    tracing::info!(
        scanned = report.scanned,
        hashed = report.hashed,
        removed = report.removed,
        elapsed_ms = report.elapsed_ms,
        "scan"
    );
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn hashes_only_changed_files_and_drops_deleted_ones() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        fs::create_dir_all(root.join("Ojukwu")).unwrap();
        fs::create_dir_all(root.join("Game/Saved")).unwrap();
        fs::write(root.join("Ojukwu/face.blend"), b"face").unwrap();
        fs::write(root.join("Ojukwu/face.blend1"), b"backup").unwrap();
        fs::write(root.join("Game/Saved/log.txt"), b"ignored").unwrap();
        fs::write(root.join("notes.md"), b"notes").unwrap();
        let idx = Index::open_in_memory().unwrap();
        let rules = IgnoreRules::default();

        let r1 = scan(root, "", &idx, &rules).unwrap();
        assert_eq!(
            (r1.scanned, r1.hashed, r1.unchanged, r1.removed),
            (2, 2, 0, 0)
        );
        assert_eq!(
            idx.all_files()
                .unwrap()
                .iter()
                .map(|f| f.path.clone())
                .collect::<Vec<_>>(),
            vec!["Ojukwu/face.blend", "notes.md"]
        );

        let r2 = scan(root, "", &idx, &rules).unwrap();
        assert_eq!((r2.scanned, r2.hashed, r2.unchanged), (2, 0, 2));

        idx.set_synced("notes.md", "01ARZ3NDEKTSV4RRFFQ69G5FAV")
            .unwrap();
        // Same bytes, new mtime: stays synced.
        let later = std::time::SystemTime::now() + std::time::Duration::from_secs(5);
        fs::write(root.join("notes.md"), b"notes").unwrap();
        fs::File::open(root.join("notes.md"))
            .unwrap()
            .set_modified(later)
            .unwrap();
        let r3 = scan(root, "", &idx, &rules).unwrap();
        assert_eq!(r3.hashed, 1);
        assert_eq!(
            idx.get_file("notes.md")
                .unwrap()
                .unwrap()
                .synced_version_id
                .as_deref(),
            Some("01ARZ3NDEKTSV4RRFFQ69G5FAV")
        );

        // New bytes: unsynced. Deleted file: removed. Folder scan touches only its subtree.
        fs::write(root.join("notes.md"), b"notes v2").unwrap();
        fs::File::open(root.join("notes.md"))
            .unwrap()
            .set_modified(later + std::time::Duration::from_secs(5))
            .unwrap();
        fs::remove_file(root.join("Ojukwu/face.blend")).unwrap();
        let r4 = scan(root, "Ojukwu", &idx, &rules).unwrap();
        assert_eq!((r4.scanned, r4.removed), (0, 1));
        assert_eq!(
            idx.get_file("notes.md").unwrap().unwrap().synced_version_id,
            Some("01ARZ3NDEKTSV4RRFFQ69G5FAV".into())
        );
        let r5 = scan(root, "", &idx, &rules).unwrap();
        assert_eq!(r5.hashed, 1);
        assert_eq!(
            idx.get_file("notes.md").unwrap().unwrap().synced_version_id,
            None
        );
    }
}
