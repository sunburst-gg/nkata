//! The desktop window. Tauri 2 shell around the agent core. Built with `--features desktop`
//! (tauri.conf.json passes it), so the agent CLI and its tests build without WebKit.
//! https://v2.tauri.app/develop/calling-rust/

/// Package version for the About line in Profile.
#[tauri::command]
fn package_version() -> &'static str {
    nkata_agent::PACKAGE_VERSION
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![package_version])
        .run(tauri::generate_context!())
        .expect("the Nkata window failed to start");
}
