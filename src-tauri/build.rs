fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "read_client_state",
            "write_client_state",
            "get_account_secret",
            "put_account_secret",
            "remove_account_secret",
            "acquire_storage_operation",
            "check_storage_operation",
            "release_storage_operation",
        ]),
    ))
    .expect("failed to build native application manifest");
}
