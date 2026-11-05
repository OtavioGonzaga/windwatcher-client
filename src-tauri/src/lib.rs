//! Minimal native host for the shared Windwatcher frontend.

/// Starts the shared frontend with the scoped, cookie-free native HTTP plugin.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .run(tauri::generate_context!())
        .expect("failed to run Windwatcher");
}
