//! Nkata agent core.
//!
//! Index, chunking, sync, and the offline queue. The Tauri window (later step)
//! and the CLI binary both call into this crate. See docs/engineering.md,
//! Storage and sync.

pub mod agent;
pub mod api;
pub mod chunker;
pub mod client;
pub mod error;
pub mod ids;
pub mod ignore;
pub mod index;
pub mod mirror;
pub mod protocol;
pub mod queue;
pub mod relay;
pub mod scan;
pub mod stream;
pub mod sync;
pub mod ue5;
pub mod watch;

pub use agent::{Agent, AgentConfig};
pub use error::AgentError;

/// Package version. A project pins this number. See docs/engineering.md, Repo and stack.
pub const PACKAGE_VERSION: &str = env!("CARGO_PKG_VERSION");
