//! File watcher. `notify` can drop events on very large trees, so the watcher only wakes a
//! rescan of the folder it reports. The index stays the truth. See docs/engineering.md,
//! Five decisions, Rust file watcher. notify: https://docs.rs/notify, debouncer:
//! https://docs.rs/notify-debouncer-full

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Receiver};
use std::time::Duration;

use notify::RecursiveMode;
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, RecommendedCache};

use crate::error::Result;
use crate::ignore::IgnoreRules;
use crate::scan::rel_path;

pub const DEBOUNCE: Duration = Duration::from_millis(500);

pub struct Watcher {
    _debouncer: Debouncer<notify::RecommendedWatcher, RecommendedCache>,
    rx: Receiver<BTreeSet<String>>,
}

impl Watcher {
    /// Starts watching `root`. Each message on `folders()` is a set of project-relative
    /// folders ("" for the root) that need a rescan.
    pub fn start(root: &Path, rules: IgnoreRules) -> Result<Self> {
        let (tx, rx) = mpsc::channel::<BTreeSet<String>>();
        let root_buf: PathBuf = root.to_path_buf();
        let mut debouncer =
            new_debouncer(
                DEBOUNCE,
                None,
                move |result: DebounceEventResult| match result {
                    Ok(events) => {
                        let mut folders = BTreeSet::new();
                        for ev in events {
                            for p in &ev.paths {
                                let Some(folder) = folder_of(&root_buf, p, &rules) else {
                                    continue;
                                };
                                folders.insert(folder);
                            }
                        }
                        if !folders.is_empty() {
                            let _ = tx.send(folders);
                        }
                    }
                    Err(errors) => {
                        for e in errors {
                            tracing::warn!(error = %e, "watch error");
                        }
                    }
                },
            )?;
        debouncer.watch(root, RecursiveMode::Recursive)?;
        Ok(Self {
            _debouncer: debouncer,
            rx,
        })
    }

    pub fn folders(&self) -> &Receiver<BTreeSet<String>> {
        &self.rx
    }
}

/// The project-relative folder to rescan for a changed path, or None when ignored.
pub fn folder_of(root: &Path, path: &Path, rules: &IgnoreRules) -> Option<String> {
    let rel = path.strip_prefix(root).ok()?;
    if rel.as_os_str().is_empty() {
        return Some(String::new());
    }
    if rules.is_ignored(rel, path.is_dir()) {
        return None;
    }
    let parent = if path.is_dir() { path } else { path.parent()? };
    Some(rel_path(root, parent).unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_changed_paths_to_their_folder() {
        let root = Path::new("/p");
        let rules = IgnoreRules::default();
        assert_eq!(
            folder_of(root, Path::new("/p/Ojukwu/face.blend"), &rules).as_deref(),
            Some("Ojukwu")
        );
        assert_eq!(
            folder_of(root, Path::new("/p/top.md"), &rules).as_deref(),
            Some("")
        );
        assert_eq!(
            folder_of(root, Path::new("/p/Game/Saved/x.log"), &rules),
            None
        );
        assert_eq!(folder_of(root, Path::new("/elsewhere/x"), &rules), None);
    }

    #[test]
    fn wakes_a_folder_rescan_on_write() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("Ojukwu")).unwrap();
        let w = Watcher::start(dir.path(), IgnoreRules::default()).unwrap();
        std::thread::sleep(Duration::from_millis(200));
        std::fs::write(dir.path().join("Ojukwu/face.blend"), b"x").unwrap();
        let folders = w
            .folders()
            .recv_timeout(Duration::from_secs(10))
            .expect("a rescan request");
        assert!(folders.contains("Ojukwu"), "{folders:?}");
    }
}
