//! Minimal native host for the shared Windwatcher frontend.
#[cfg(all(feature = "storage-smoke", not(debug_assertions)))]
compile_error!("The storage-smoke feature is debug-only and must not ship in release builds.");
mod storage;
// Exercise the exact vendored Android commit decision on host CI without JNI.
#[cfg(test)]
#[path = "../vendor/android-native-keyring-store/src/commit_result.rs"]
mod android_commit_result;

/// Starts the shared frontend with the scoped, cookie-free native HTTP plugin.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            storage::read_client_state,
            storage::write_client_state,
            storage::get_account_secret,
            storage::put_account_secret,
            storage::remove_account_secret,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Windwatcher");
}
