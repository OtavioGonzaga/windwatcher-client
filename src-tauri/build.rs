fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "read_client_state",
            "write_client_state",
            "get_account_secret",
            "put_account_secret",
            "remove_account_secret",
        ]),
    ))
    .expect("failed to build native application manifest");
}
