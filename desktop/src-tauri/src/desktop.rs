//! The desktop window. Tauri 2 shell around the agent core. Built with `--features desktop`
//! (tauri.conf.json passes it), so the agent CLI and its tests build without WebKit.
//! The UI starts, stops, and asks the agent through these commands; the agent itself is the
//! same code the CLI runs (nkata_agent::runtime).
//! https://v2.tauri.app/develop/calling-rust/

use std::path::{Path, PathBuf};

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

/// A folder shipped with the app: next to the executable in a bundle (tauri.conf.json,
/// bundle.resources), or up the tree when the app runs from the repo. `marker` is one file
/// that proves the folder is the right one.
fn shipped_dir(env_var: &str, rel: &str, marker: &str) -> Option<PathBuf> {
    if let Ok(dir) = std::env::var(env_var) {
        return Some(PathBuf::from(dir));
    }
    let here = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()));
    for base in here.into_iter().chain(std::env::current_dir().ok()) {
        for up in [
            "",
            "../",
            "../../",
            "../../../",
            "../Resources/",
            "../Resources/_up_/_up_/",
        ] {
            let candidate = base.join(format!("{up}{rel}"));
            if candidate.join(marker).is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

/// Where the UE5 scripts live when the app runs from the repo or from a bundle.
fn scripts_dir() -> PathBuf {
    shipped_dir(
        "NKATA_UE5_SCRIPTS",
        "ue5-plugin/scripts",
        "import_character.py",
    )
    .unwrap_or_else(|| PathBuf::from("ue5-plugin/scripts"))
}

fn addon_dir() -> Option<PathBuf> {
    shipped_dir(
        "NKATA_BLENDER_ADDON",
        "blender-addon",
        "blender_manifest.toml",
    )
}

/// The generated shared Python types, zipped into the add-on as nkata/nkata_shared in place
/// of any vendored copy (tools::extension_zip).
fn shared_py_dir() -> Option<PathBuf> {
    shipped_dir("NKATA_SHARED_PY", "shared/py", "common.py")
}

/// True when an add-on that can import ships with this build: the folder plus either its
/// vendored shared package or shared/py.
fn addon_installable() -> bool {
    addon_dir().is_some_and(|dir| {
        dir.join(nkata_agent::tools::SHARED_IN_ADDON)
            .join("__init__.py")
            .is_file()
            || shared_py_dir().is_some()
    })
}

fn plugin_dir() -> Option<PathBuf> {
    shipped_dir("NKATA_UE5_PLUGIN", "ue5-plugin", "Nkata.uplugin")
}

/// What the Tools step shows: Blender on this machine, the Unreal projects inside the folder,
/// and whether the add-on and plugin folders shipped with this build.
#[derive(serde::Serialize)]
struct ToolsReport {
    blender: Option<nkata_agent::tools::BlenderInstall>,
    uprojects: Vec<String>,
    addon_shipped: bool,
    plugin_shipped: bool,
}

#[tauri::command]
async fn tools_detect(folder: String) -> Result<ToolsReport, String> {
    tauri::async_runtime::spawn_blocking(move || ToolsReport {
        blender: nkata_agent::tools::find_blender(),
        uprojects: nkata_agent::tools::find_uprojects(&nkata_agent::runtime::expand_home(
            Path::new(&folder),
        ))
        .into_iter()
        .map(|p| p.display().to_string())
        .collect(),
        addon_shipped: addon_installable(),
        plugin_shipped: plugin_dir().is_some(),
    })
    .await
    .map_err(|e| e.to_string())
}

/// Open previous version: the .blend behind a version, fetched and opened in Blender as its own file.
#[tauri::command]
async fn open_version(
    rt: State<'_, Runtime>,
    part_id: String,
    version_id: String,
    file_name: String,
) -> Result<String, String> {
    rt.open_version(&part_id, &version_id, &file_name)
        .await
        .map(|p| p.display().to_string())
        .map_err(|e| e.to_string())
}

/// Open in Blender: the part's own file in the project folder.
#[tauri::command]
async fn open_in_blender(rt: State<'_, Runtime>, rel_file: String) -> Result<String, String> {
    rt.open_file(&rel_file)
        .await
        .map(|p| p.display().to_string())
        .map_err(|e| e.to_string())
}

/// Fetches a file the server serves under a signed link and writes it where the person chose:
/// the GLB or the FBX of a version. The webview cannot save a cross-origin download itself.
#[tauri::command]
async fn download_file(url: String, path: String) -> Result<String, String> {
    let bytes = reqwest::get(&url)
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;
    tokio::fs::write(&path, &bytes)
        .await
        .map_err(|e| format!("{path}: {e}"))?;
    Ok(path)
}

/// The .blend files inside the project folder, project-relative. For Create asset, From a file.
#[tauri::command]
async fn list_blend_files(folder: String) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        nkata_agent::tools::find_blend_files(&nkata_agent::runtime::expand_home(Path::new(&folder)))
    })
    .await
    .map_err(|e| e.to_string())
}

/// Where a project lives when the person picks `folder` for it (tools::place_in).
#[tauri::command]
async fn place_for(folder: String, name: String, project_id: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let at = nkata_agent::runtime::expand_home(Path::new(&folder));
        nkata_agent::tools::place_in(&at, &name, &project_id).display().to_string()
    })
    .await
    .map_err(|e| e.to_string())
}

/// Installs and enables the add-on through Blender's command line. Returns Blender's last line.
#[tauri::command]
async fn tools_install_blender() -> Result<String, String> {
    let addon = addon_dir().ok_or("the add-on did not ship with this build")?;
    let shared_py = shared_py_dir();
    let blender = nkata_agent::tools::find_blender().ok_or("Blender was not found")?;
    tauri::async_runtime::spawn_blocking(move || {
        let work = std::env::temp_dir().join("nkata-tools");
        nkata_agent::tools::install_blender_addon(&blender.exe, &addon, shared_py.as_deref(), &work)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Copies the plugin into the Unreal project and turns it on with Python and Remote Control.
#[tauri::command]
async fn tools_install_ue(uproject: String) -> Result<String, String> {
    let plugin = plugin_dir().ok_or("the plugin did not ship with this build")?;
    tauri::async_runtime::spawn_blocking(move || {
        nkata_agent::tools::install_ue_plugin(Path::new(&uproject), &plugin)
            .map(|p| p.display().to_string())
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
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
    // The folder picker on New project. https://v2.tauri.app/plugin/dialog/
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Runtime::new())
        .invoke_handler(tauri::generate_handler![
            package_version,
            agent_status,
            agent_start_sync,
            agent_start_stream,
            agent_stop,
            write_export,
            tools_detect,
            list_blend_files,
            place_for,
            download_file,
            open_version,
            open_in_blender,
            tools_install_blender,
            tools_install_ue
        ])
        .run(tauri::generate_context!())
        .expect("the Nkata window failed to start");
}
