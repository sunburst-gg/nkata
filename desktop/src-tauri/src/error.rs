//! One error type for the crate. Every variant carries context.

use std::path::PathBuf;

#[derive(Debug, thiserror::Error)]
pub enum AgentError {
    #[error("io error at {path}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("index error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("network error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("server said {status} {code}: {message}")]
    Server {
        status: u16,
        code: String,
        message: String,
    },
    #[error("store said {status} for {url}")]
    Store { status: u16, url: String },
    #[error("chunking failed at {path}: {source}")]
    Chunk {
        path: PathBuf,
        #[source]
        source: fastcdc::v2020::Error,
    },
    #[error("watch error: {0}")]
    Watch(#[from] notify::Error),
    #[error("{0}")]
    Config(String),
    /// A pull that would not fit on the disk. The message is what the person reads.
    #[error("Not enough space on this computer: the project needs {} more. Free some space; it catches up by itself.", crate::sync::size_words(needed.saturating_sub(*available)))]
    NoSpace { needed: u64, available: u64 },
    #[error("hash mismatch for {path}: expected {expected}, got {actual}")]
    HashMismatch {
        path: String,
        expected: String,
        actual: String,
    },
}

impl AgentError {
    pub fn io(path: impl Into<PathBuf>, source: std::io::Error) -> Self {
        AgentError::Io {
            path: path.into(),
            source,
        }
    }

    /// True when the failure is the network, not the data. The queue keeps the item.
    pub fn is_offline(&self) -> bool {
        match self {
            AgentError::Http(e) => e.is_connect() || e.is_timeout() || e.is_request(),
            AgentError::Server { status, .. } => *status >= 500,
            AgentError::Store { status, .. } => *status >= 500,
            _ => false,
        }
    }
}

pub type Result<T> = std::result::Result<T, AgentError>;
