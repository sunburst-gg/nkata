//! Updates without a new download from the website. A release build checks the manifest the
//! release workflow writes (latest/latest.json in the downloads bucket) a little after launch and
//! every six hours, downloads a newer version in the background, and holds it until the person
//! picks Restart. The package's signature is checked against the public key in tauri.conf.json
//! before anything is installed. Dev builds never update.
//! https://v2.tauri.app/plugin/updater/
//! https://docs.rs/tauri-plugin-updater/latest/tauri_plugin_updater/struct.Update.html

use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_updater::{Update, UpdaterExt};

const FIRST_CHECK: Duration = Duration::from_secs(20);
const EVERY: Duration = Duration::from_secs(6 * 60 * 60);

/// The manifest's key for this build. The macOS app is one universal build, so it has its own
/// key; Windows uses the plugin's default, windows-x86_64.
pub fn target() -> Option<&'static str> {
    if cfg!(target_os = "macos") {
        Some("darwin-universal")
    } else {
        None
    }
}

/// A newer version, downloaded and waiting for Restart.
struct Ready {
    update: Update,
    bytes: Vec<u8>,
}

#[derive(Default)]
pub struct Updates {
    ready: Mutex<Option<Ready>>,
}

impl Updates {
    fn ready_version(&self) -> Option<String> {
        self.ready
            .lock()
            .ok()
            .and_then(|r| r.as_ref().map(|r| r.update.version.clone()))
    }
}

/// Starts the background checks. A no-op in dev builds, so `pnpm tauri dev` never replaces itself.
pub fn start<R: Runtime>(app: &AppHandle<R>) {
    if cfg!(debug_assertions) {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(FIRST_CHECK).await;
        loop {
            if app.state::<Updates>().ready_version().is_some() {
                return;
            }
            if let Err(e) = check_and_download(&app).await {
                // An offline laptop or a bucket that does not answer: try again next round.
                tracing::warn!(error = %e, "update check failed");
            }
            tokio::time::sleep(EVERY).await;
        }
    });
}

async fn check_and_download<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<(), tauri_plugin_updater::Error> {
    let Some(update) = app.updater()?.check().await? else {
        tracing::info!("no newer version");
        return Ok(());
    };
    tracing::info!(current = %update.current_version, next = %update.version, "downloading update");
    let bytes = update.download(|_, _| {}, || {}).await?;
    // Verified now as well as at install, so a bad package is never offered.
    update.verify(&bytes)?;
    tracing::info!(next = %update.version, bytes = bytes.len(), "update ready");
    if let Ok(mut ready) = app.state::<Updates>().ready.lock() {
        *ready = Some(Ready { update, bytes });
    }
    Ok(())
}

/// The version waiting for Restart, if any.
#[tauri::command]
pub fn update_ready(updates: tauri::State<'_, Updates>) -> Option<String> {
    updates.ready_version()
}

/// Installs the waiting version and starts it. On Windows the installer closes the app and
/// opens the new one; on macOS the app is replaced in place and restarts here.
#[tauri::command]
pub fn update_restart<R: Runtime>(
    app: AppHandle<R>,
    updates: tauri::State<'_, Updates>,
) -> Result<(), String> {
    let ready = updates
        .ready
        .lock()
        .map_err(|_| "the update is not available".to_string())?
        .take()
        .ok_or_else(|| "no update is waiting".to_string())?;
    tracing::info!(next = %ready.update.version, "installing update");
    ready
        .update
        .install(&ready.bytes)
        .map_err(|e| e.to_string())?;
    app.restart()
}
