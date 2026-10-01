//! The agent: one project folder, one index, one server session.

use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::Serialize;

use crate::client::ServerClient;
use crate::error::{AgentError, Result};
use crate::ignore::{IgnoreRules, AGENT_DIR};
use crate::index::Index;
use crate::scan::{self, ScanReport};
use crate::sync::{self, PullReport, PushReport};
use crate::watch::Watcher;

/// Full rescan cadence. See docs/engineering.md, Index.
pub const FULL_RESCAN_EVERY: Duration = Duration::from_secs(10 * 60);

#[derive(Debug, Clone)]
pub struct AgentConfig {
    pub folder: PathBuf,
    pub index_path: PathBuf,
    pub server_url: String,
    pub token: String,
    pub project_id: String,
}

impl AgentConfig {
    /// Default index location inside the project folder's agent dir.
    pub fn default_index_path(folder: &Path) -> PathBuf {
        folder.join(AGENT_DIR).join("index.db")
    }

    pub fn save(&self, index: &Index) -> Result<()> {
        index.set_meta("server_url", &self.server_url)?;
        index.set_meta("token", &self.token)?;
        index.set_meta("project_id", &self.project_id)?;
        Ok(())
    }

    /// Reads the saved config from an index created by `init`.
    pub fn load(folder: &Path, index_path: Option<PathBuf>) -> Result<Self> {
        let index_path = index_path.unwrap_or_else(|| Self::default_index_path(folder));
        let index = Index::open(&index_path)?;
        let get = |k: &str| {
            index.get_meta(k)?.ok_or_else(|| {
                AgentError::Config(format!(
                    "agent not initialised: missing {k}. Run init first."
                ))
            })
        };
        Ok(Self {
            folder: folder.to_path_buf(),
            index_path,
            server_url: get("server_url")?,
            token: get("token")?,
            project_id: get("project_id")?,
        })
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct SyncReport {
    pub scan: ScanReport,
    pub push: PushReport,
    pub pull: PullReport,
}

pub struct Agent {
    config: AgentConfig,
    index: Index,
    client: ServerClient,
    rules: IgnoreRules,
}

impl Agent {
    pub fn open(config: AgentConfig) -> Result<Self> {
        let index = Index::open(&config.index_path)?;
        config.save(&index)?;
        let client = ServerClient::new(&config.server_url, &config.token, &config.project_id)?;
        let rules = IgnoreRules::for_project(&config.folder);
        Ok(Self {
            config,
            index,
            client,
            rules,
        })
    }

    pub fn index(&self) -> &Index {
        &self.index
    }

    pub fn config(&self) -> &AgentConfig {
        &self.config
    }

    pub fn scan(&self, sub: &str) -> Result<ScanReport> {
        scan::scan(&self.config.folder, sub, &self.index, &self.rules)
    }

    pub async fn push(&self) -> Result<PushReport> {
        sync::push(&self.config.folder, &self.index, &self.client).await
    }

    pub async fn pull(&self) -> Result<PullReport> {
        sync::pull(&self.config.folder, &self.index, &self.client).await
    }

    /// Scan, push, pull.
    pub async fn sync(&self) -> Result<SyncReport> {
        let scan = self.scan("")?;
        let push = self.push().await?;
        let pull = self.pull().await?;
        Ok(SyncReport { scan, push, pull })
    }

    /// Watches the folder. On a change: rescan that folder and push. Every `pull_every`: pull.
    /// Every 10 minutes: full rescan. Runs until `stop` is cancelled.
    pub async fn watch(
        &self,
        pull_every: Duration,
        stop: tokio::sync::watch::Receiver<bool>,
    ) -> Result<()> {
        let watcher = Watcher::start(&self.config.folder, self.rules.clone())?;
        let mut last_full = std::time::Instant::now();
        let mut last_pull = std::time::Instant::now();
        self.sync().await?;
        loop {
            if *stop.borrow() {
                return Ok(());
            }
            let mut folders = std::collections::BTreeSet::new();
            while let Ok(set) = watcher.folders().try_recv() {
                folders.extend(set);
            }
            if last_full.elapsed() >= FULL_RESCAN_EVERY {
                folders.clear();
                folders.insert(String::new());
                last_full = std::time::Instant::now();
            }
            if !folders.is_empty() {
                for f in &folders {
                    if let Err(e) = self.scan(f) {
                        tracing::error!(project_id = self.config.project_id, folder = f, error = %e, "rescan failed");
                    }
                }
                if let Err(e) = self.push().await {
                    tracing::warn!(project_id = self.config.project_id, error = %e, "push failed, will retry");
                }
            }
            if last_pull.elapsed() >= pull_every {
                last_pull = std::time::Instant::now();
                if let Err(e) = self.pull().await {
                    tracing::warn!(project_id = self.config.project_id, error = %e, "pull failed, will retry");
                }
            }
            tokio::time::sleep(Duration::from_millis(250)).await;
        }
    }
}
