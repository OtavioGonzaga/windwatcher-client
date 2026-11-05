//! Minimal native host for the shared Windwatcher frontend.

/// Starts the native application without exposing custom commands or plugins.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("failed to run Windwatcher");
}
