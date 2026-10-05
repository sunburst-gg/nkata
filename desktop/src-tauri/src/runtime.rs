//! The agent inside the desktop app. One project at a time: sync mode runs the local API, the
//! mirror runner, the event relay, and the watcher; stream mode runs the local API over a cache.
//! The Tauri window calls start, stop, and status; the CLI does the same from the shell.
//! See docs/engineering.md, System architecture.

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use serde::Serialize;
use tokio::sync::{watch, Mutex};

use crate::agent::{Agent, AgentConfig};
use crate::api::{self, ServeOptions};
use crate::client::ServerClient;
use crate::error::{AgentError, Result};
use crate::protocol::AgentMode;
use crate::stream::{StreamCache, StreamConfig, DEFAULT_CAP_BYTES};

pub const PULL_EVERY: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct Status {
    pub running: bool,
    pub mode: Option<AgentMode>,
    pub project_id: Option<String>,
    pub folder: Option<String>,
    pub port: Option<u16>,
}

#[derive(Debug, Clone)]
pub struct StartSync {
    pub server_url: String,
    pub token: String,
    pub project_id: String,
    pub folder: PathBuf,
    pub port: u16,
    pub ue5_url: String,
    pub scripts_dir: PathBuf,
}

#[derive(Debug, Clone)]
pub struct StartStream {
    pub server_url: String,
    pub token: String,
    pub project_id: String,
    pub cache: Option<PathBuf>,
    pub port: u16,
    pub ue5_url: String,
    pub scripts_dir: PathBuf,
}

struct Running {
    stop: watch::Sender<bool>,
    status: Status,
}

/// Owns the running agent. Clone it into the Tauri state; stop replaces nothing until start.
#[derive(Clone, Default)]
pub struct Runtime {
    inner: Arc<Mutex<Option<Running>>>,
}

impl Runtime {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn status(&self) -> Status {
        match self.inner.lock().await.as_ref() {
            Some(r) => r.status.clone(),
            None => Status {
                running: false,
                mode: None,
                project_id: None,
                folder: None,
                port: None,
            },
        }
    }

    /// Sync mode: binds the folder to the project on first start, then runs the local API, the
    /// mirror and the relay, and the watcher that pushes on change and pulls on an interval.
    pub async fn start_sync(&self, opts: StartSync) -> Result<Status> {
        self.stop().await;
        let folder =
            std::fs::canonicalize(&opts.folder).map_err(|e| AgentError::io(&opts.folder, e))?;
        let config = AgentConfig {
            index_path: AgentConfig::default_index_path(&folder),
            folder: folder.clone(),
            server_url: opts.server_url.clone(),
            token: opts.token.clone(),
            project_id: opts.project_id.clone(),
        };
        let agent = Agent::open(config)?;
        let server = ServerClient::new(&opts.server_url, &opts.token, &opts.project_id)?;
        let (stop, rx) = watch::channel(false);
        let scripts_dir = opts.scripts_dir.clone();
        let api_rx = rx.clone();
        let (addr_tx, addr_rx) = tokio::sync::oneshot::channel();
        tokio::spawn(async move {
            let serve = api::serve_with_addr(
                server,
                ServeOptions {
                    folder,
                    port: opts.port,
                    ue5_url: opts.ue5_url,
                    scripts_dir,
                    token_file: None,
                    mode: AgentMode::Sync,
                },
                api_rx,
                addr_tx,
            );
            if let Err(e) = serve.await {
                tracing::error!(error = %e, "local api stopped");
            }
        });
        // The watcher holds the SQLite index across awaits, so it runs on its own thread with
        // its own runtime instead of the shared task pool.
        let watch_rx = rx.clone();
        std::thread::Builder::new()
            .name("nkata-watch".into())
            .spawn(move || {
                let rt = match tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                {
                    Ok(rt) => rt,
                    Err(e) => {
                        tracing::error!(error = %e, "watcher runtime failed");
                        return;
                    }
                };
                if let Err(e) = rt.block_on(agent.watch(PULL_EVERY, watch_rx)) {
                    tracing::error!(error = %e, "watcher stopped");
                }
            })
            .map_err(|e| AgentError::io("watch thread", e))?;
        let port = addr_rx
            .await
            .map_err(|_| AgentError::Config("local api did not start".into()))?
            .port();
        let status = Status {
            running: true,
            mode: Some(AgentMode::Sync),
            project_id: Some(opts.project_id),
            folder: Some(opts.folder.display().to_string()),
            port: Some(port),
        };
        *self.inner.lock().await = Some(Running {
            stop,
            status: status.clone(),
        });
        Ok(status)
    }

    /// Stream mode for a viewer: no folder, the local API over the cache.
    pub async fn start_stream(&self, opts: StartStream) -> Result<Status> {
        self.stop().await;
        let root = opts
            .cache
            .clone()
            .unwrap_or_else(|| crate::stream::default_root(&opts.project_id));
        let store = StreamCache::open(&root, DEFAULT_CAP_BYTES)?;
        store.save_config(&StreamConfig {
            server_url: opts.server_url.clone(),
            token: opts.token.clone(),
            project_id: opts.project_id.clone(),
        })?;
        let server = ServerClient::new(&opts.server_url, &opts.token, &opts.project_id)?;
        let (stop, rx) = watch::channel(false);
        let (addr_tx, addr_rx) = tokio::sync::oneshot::channel();
        let cache_root = root.clone();
        tokio::spawn(async move {
            let serve = api::serve_with_addr(
                server,
                ServeOptions {
                    folder: cache_root,
                    port: opts.port,
                    ue5_url: opts.ue5_url,
                    scripts_dir: opts.scripts_dir,
                    token_file: None,
                    mode: AgentMode::Stream,
                },
                rx,
                addr_tx,
            );
            if let Err(e) = serve.await {
                tracing::error!(error = %e, "local api stopped");
            }
        });
        let port = addr_rx
            .await
            .map_err(|_| AgentError::Config("local api did not start".into()))?
            .port();
        let status = Status {
            running: true,
            mode: Some(AgentMode::Stream),
            project_id: Some(opts.project_id),
            folder: Some(root.display().to_string()),
            port: Some(port),
        };
        *self.inner.lock().await = Some(Running {
            stop,
            status: status.clone(),
        });
        Ok(status)
    }

    pub async fn stop(&self) {
        if let Some(r) = self.inner.lock().await.take() {
            let _ = r.stop.send(true);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn status_is_stopped_before_start_and_after_stop() {
        let rt = Runtime::new();
        assert!(!rt.status().await.running);
        rt.stop().await;
        assert!(!rt.status().await.running);
    }
}
