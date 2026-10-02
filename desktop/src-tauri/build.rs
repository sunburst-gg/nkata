// Tauri's build step runs only with the desktop feature, so `make test` builds the agent
// on machines without WebKit. https://v2.tauri.app/start/
fn main() {
    #[cfg(feature = "desktop")]
    tauri_build::build();
}
