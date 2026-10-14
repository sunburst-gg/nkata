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
use crate::ignore::AGENT_DIR;
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
    /// The server as this agent talks to it, for Open previous version. None in stream mode.
    server: Option<ServerClient>,
    folder: Option<PathBuf>,
}

/// Where fetched versions and opened copies live inside the agent's folder, which the sync skips.
const VERSIONS_DIR: &str = "versions";
const OPEN_DIR: &str = "open";

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
        // The window offers "~/Projects/<name>" as the default and the folder may not exist yet.
        let wanted = expand_home(&opts.folder);
        std::fs::create_dir_all(&wanted).map_err(|e| AgentError::io(&wanted, e))?;
        let folder = std::fs::canonicalize(&wanted).map_err(|e| AgentError::io(&wanted, e))?;
        let folder_for_open = folder.clone();
        let server_for_open = ServerClient::new(&opts.server_url, &opts.token, &opts.project_id)?;
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
            server: Some(server_for_open),
            folder: Some(folder_for_open),
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
            server: None,
            folder: None,
        });
        Ok(status)
    }

    /// Open previous version: fetches the .blend behind `version_id` into the agent's folder,
    /// copies it to a file named for the version outside any part mapping, and launches
    /// Blender on it. The add-on sees a plain file there: nothing locks, nothing publishes.
    pub async fn open_version(
        &self,
        part_id: &str,
        version_id: &str,
        file_name: &str,
    ) -> Result<PathBuf> {
        let (server, folder) = {
            let guard = self.inner.lock().await;
            let running = guard
                .as_ref()
                .ok_or_else(|| AgentError::Config("the agent is not running".into()))?;
            match (&running.server, &running.folder) {
                (Some(s), Some(f)) => (s.clone(), f.clone()),
                _ => {
                    return Err(AgentError::Config(
                        "open a project folder first: a viewer streams, it does not open files"
                            .into(),
                    ))
                }
            }
        };
        let fv = server.version_file(part_id, version_id).await?;
        let cache_root = folder.join(AGENT_DIR).join(VERSIONS_DIR);
        // The cache holds a SQLite connection, which is not Sync, so a fetch that awaits with
        // the cache borrowed is not a Send future. Tauri commands must be Send, so the fetch
        // runs on its own thread with its own runtime, as the watcher does.
        let fetched = tokio::task::spawn_blocking(move || -> Result<PathBuf> {
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .map_err(|e| AgentError::io("fetch runtime", e))?;
            let cache = StreamCache::open(&cache_root, DEFAULT_CAP_BYTES)?;
            Ok(rt.block_on(cache.fetch(&server, &fv))?.path)
        })
        .await
        .map_err(|e| AgentError::Config(format!("fetch thread stopped: {e}")))??;
        let open_dir = folder.join(AGENT_DIR).join(OPEN_DIR);
        std::fs::create_dir_all(&open_dir).map_err(|e| AgentError::io(&open_dir, e))?;
        let target = open_dir.join(file_name);
        std::fs::copy(&fetched, &target).map_err(|e| AgentError::io(&target, e))?;
        let blender = crate::tools::find_blender()
            .ok_or_else(|| AgentError::Config("Blender was not found on this computer".into()))?;
        crate::tools::launch_blender(&blender.exe, &target)?;
        Ok(target)
    }

    /// Open in Blender: the part's own file, inside the project folder.
    pub async fn open_file(&self, rel: &str) -> Result<PathBuf> {
        let folder = {
            let guard = self.inner.lock().await;
            guard
                .as_ref()
                .and_then(|r| r.folder.clone())
                .ok_or_else(|| AgentError::Config("open a project folder first".into()))?
        };
        let path = folder.join(rel);
        if !path.is_file() {
            return Err(AgentError::Config(format!(
                "{} is not in the folder yet",
                rel
            )));
        }
        let blender = crate::tools::find_blender()
            .ok_or_else(|| AgentError::Config("Blender was not found on this computer".into()))?;
        crate::tools::launch_blender(&blender.exe, &path)?;
        Ok(path)
    }

    pub async fn stop(&self) {
        if let Some(r) = self.inner.lock().await.take() {
            let _ = r.stop.send(true);
        }
    }
}

/// A leading `~` or `~/` becomes the home folder. Anything else is returned as given.
pub fn expand_home(path: &std::path::Path) -> PathBuf {
    let Some(rest) = path.to_str().and_then(|s| s.strip_prefix('~')) else {
        return path.to_path_buf();
    };
    let Some(home) = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")) else {
        return path.to_path_buf();
    };
    let rest = rest.trim_start_matches(['/', '\\']);
    if rest.is_empty() {
        PathBuf::from(home)
    } else {
        PathBuf::from(home).join(rest)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_tilde_becomes_the_home_folder_and_other_paths_stay() {
        let home = std::env::var_os("HOME").expect("HOME is set in tests");
        assert_eq!(
            expand_home(std::path::Path::new("~/Projects/x")),
            PathBuf::from(&home).join("Projects/x")
        );
        assert_eq!(expand_home(std::path::Path::new("~")), PathBuf::from(&home));
        assert_eq!(
            expand_home(std::path::Path::new("/tmp/x")),
            PathBuf::from("/tmp/x")
        );
        assert_eq!(
            expand_home(std::path::Path::new("rel/x")),
            PathBuf::from("rel/x")
        );
    }

    /// Tauri commands await these from a Send future; the desktop build fails otherwise.
    #[test]
    fn open_version_and_open_file_are_send_futures() {
        fn check<T: Send>(_: T) {}
        let rt = Runtime::new();
        check(rt.open_version("part", "version", "file.blend"));
        check(rt.open_file("Kettle/model.blend"));
        check(rt.stop());
    }

    #[tokio::test]
    async fn status_is_stopped_before_start_and_after_stop() {
        let rt = Runtime::new();
        assert!(!rt.status().await.running);
        rt.stop().await;
        assert!(!rt.status().await.running);
    }
}
