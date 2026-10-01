//! Nkata agent core.
//!
//! Index, chunking, sync, and the offline queue. The Tauri window (later step)
//! and the CLI binary both call into this crate. See docs/engineering.md,
//! Storage and sync.

/// Package version. A project pins this number. See docs/engineering.md, Repo and stack.
pub const PACKAGE_VERSION: &str = env!("CARGO_PKG_VERSION");

#[cfg(test)]
mod tests {
    #[test]
    fn package_version_is_set() {
        assert!(!super::PACKAGE_VERSION.is_empty());
    }
}
