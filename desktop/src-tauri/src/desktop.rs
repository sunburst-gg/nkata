//! The desktop window. Tauri 2 shell around the agent core. Built with `--features desktop`
//! (tauri.conf.json passes it), so the agent CLI and its tests build without WebKit.
//! The UI starts, stops, and asks the agent through these commands; the agent itself is the
//! same code the CLI runs (nkata_agent::runtime).
//! https://v2.tauri.app/develop/calling-rust/

use std::path::PathBuf;

use nkata_agent::runtime::{Runtime, StartStream, StartSync, Status};
use tauri::State;

/// Package version for the About line in Profile.
#[tauri::command]
fn package_version() -> &'static str {
    nkata_agent::PACKAGE_VERSION
}

#[tauri::command]
async fn agent_status(rt: State<'_, Runtime>) -> Result<Status, String> {
    Ok(rt.status().await)
}

/// Where the UE5 scripts live when the app runs from the repo or from a bundle.
fn scripts_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("NKATA_UE5_SCRIPTS") {
        return PathBuf::from(dir);
    }
    let here = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()));
    for base in here.into_iter().chain(std::env::current_dir().ok()) {
        for rel in [
            "ue5-plugin/scripts",
            "../ue5-plugin/scripts",
            "../../ue5-plugin/scripts",
            "../../../ue5-plugin/scripts",
            "../Resources/ue5-plugin/scripts",
        ] {
            let candidate = base.join(rel);
            if candidate.join("import_character.py").is_file() {
                return candidate;
            }
        }
    }
    PathBuf::from("ue5-plugin/scripts")
}

#[tauri::command]
async fn agent_start_sync(
    rt: State<'_, Runtime>,
    server_url: String,
    token: String,
    project_id: String,
    folder: String,
) -> Result<Status, String> {
    rt.start_sync(StartSync {
        server_url,
        token,
        project_id,
        folder: PathBuf::from(folder),
        port: nkata_agent::api::DEFAULT_PORT,
        ue5_url: nkata_agent::ue5::DEFAULT_URL.to_string(),
        scripts_dir: scripts_dir(),
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn agent_start_stream(
    rt: State<'_, Runtime>,
    server_url: String,
    token: String,
    project_id: String,
) -> Result<Status, String> {
    rt.start_stream(StartStream {
        server_url,
        token,
        project_id,
        cache: None,
        port: nkata_agent::api::DEFAULT_PORT,
        ue5_url: nkata_agent::ue5::DEFAULT_URL.to_string(),
        scripts_dir: scripts_dir(),
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn agent_stop(rt: State<'_, Runtime>) -> Result<Status, String> {
    rt.stop().await;
    Ok(rt.status().await)
}

/// Writes an export manifest next to the project folder, where the artist can find it.
#[tauri::command]
async fn write_export(folder: String, name: String, json: String) -> Result<String, String> {
    let dir = PathBuf::from(folder).join("exports");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{name}.json"));
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}

fn main() {
    tracing_subscriber::fmt()
        .json()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .with_writer(std::io::stderr)
        .init();
    tauri::Builder::default()
        .manage(Runtime::new())
        .invoke_handler(tauri::generate_handler![
            package_version,
            agent_status,
            agent_start_sync,
            agent_start_stream,
            agent_stop,
            write_export
        ])
        .run(tauri::generate_context!())
        .expect("the Nkata window failed to start");
}
