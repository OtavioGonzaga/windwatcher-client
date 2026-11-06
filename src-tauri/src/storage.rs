//! Fixed app-data document and Rust-only OS credential access. Never log backend errors.
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::PathBuf,
};
use tauri::Manager;
use tauri_plugin_keyring_store::{Error, KeyringStore};

type StorageResult<T> = Result<T, &'static str>;
const MAX_DOCUMENT: u64 = 1_048_576;
const MAX_SECRET: usize = 16_384;
#[cfg(not(feature = "storage-smoke"))]
const SERVICE: &str = "io.github.otaviogonzaga.windwatcher.client.sessions.v1";
#[cfg(feature = "storage-smoke")]
const SERVICE: &str = "io.github.otaviogonzaga.windwatcher.client.storage-smoke.v1";

fn alias(account_id: &str) -> StorageResult<String> {
    let id = uuid::Uuid::parse_str(account_id).map_err(|_| "corrupt")?;
    if id.get_version_num() != 4
        || id.get_variant() != uuid::Variant::RFC4122
        || id.to_string() != account_id
    {
        return Err("corrupt");
    }
    Ok(format!("windwatcher-client:v1:{id}"))
}

fn safe_error(error: Error) -> &'static str {
    match error {
        Error::KeychainLocked => "locked",
        Error::Encoding(_) => "corrupt",
        _ => "unavailable",
    }
}

#[tauri::command(async)]
pub fn get_account_secret(account_id: String) -> StorageResult<Option<Vec<u8>>> {
    let record = KeyringStore::new(SERVICE)
        .get_bytes(&alias(&account_id)?)
        .map_err(safe_error)?;
    if record
        .as_ref()
        .is_some_and(|bytes| bytes.is_empty() || bytes.len() > MAX_SECRET)
    {
        return Err("corrupt");
    }
    Ok(record)
}

#[tauri::command(async)]
pub fn put_account_secret(account_id: String, record: Vec<u8>) -> StorageResult<()> {
    if record.is_empty() || record.len() > MAX_SECRET {
        return Err("corrupt");
    }
    KeyringStore::new(SERVICE)
        .set_bytes(&alias(&account_id)?, &record)
        .map_err(safe_error)
}

#[tauri::command(async)]
pub fn remove_account_secret(account_id: String) -> StorageResult<()> {
    KeyringStore::new(SERVICE)
        .delete(&alias(&account_id)?)
        .map_err(safe_error)
}

fn directory(app: &tauri::AppHandle) -> StorageResult<PathBuf> {
    let path = app.path().app_data_dir().map_err(|_| "unavailable")?;
    #[cfg(feature = "storage-smoke")]
    let path = path.join("storage-smoke");
    fs::create_dir_all(&path).map_err(|_| "permission-denied")?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&path, fs::Permissions::from_mode(0o700))
            .map_err(|_| "permission-denied")?;
    }
    Ok(path)
}

fn open_private(path: PathBuf) -> StorageResult<File> {
    let mut options = OpenOptions::new();
    options.read(true).write(true).create(true).truncate(false);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options.open(path).map_err(|_| "permission-denied")
}

fn read_document(path: PathBuf) -> StorageResult<Option<String>> {
    let file = match File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("permission-denied"),
    };
    let mut text = String::new();
    file.take(MAX_DOCUMENT + 1)
        .read_to_string(&mut text)
        .map_err(|_| "corrupt")?;
    if text.len() as u64 > MAX_DOCUMENT {
        return Err("corrupt");
    }
    Ok(Some(text))
}

#[tauri::command(async)]
pub fn read_client_state(app: tauri::AppHandle) -> StorageResult<Option<String>> {
    read_document(directory(&app)?.join("client-state-v1.json"))
}

#[tauri::command(async)]
pub fn write_client_state(
    app: tauri::AppHandle,
    expected: Option<String>,
    document: String,
) -> StorageResult<()> {
    write_document(directory(&app)?, expected, document)
}

fn write_document(dir: PathBuf, expected: Option<String>, document: String) -> StorageResult<()> {
    if document.len() as u64 > MAX_DOCUMENT {
        return Err("corrupt");
    }
    // OS file locks serialize separate processes, not just WebView requests.
    let lock = open_private(dir.join("client-state.lock"))?;
    lock.lock().map_err(|_| "unavailable")?;
    let path = dir.join("client-state-v1.json");
    if read_document(path.clone())? != expected {
        return Err("conflict");
    }
    let value: serde_json::Value = serde_json::from_str(&document).map_err(|_| "corrupt")?;
    if value["schemaVersion"] != 1 {
        return Err("version-unsupported");
    }
    validate_nonsecret_keys(&value)?;
    let previous_revision = match &expected {
        None => 0,
        Some(text) => {
            let previous =
                serde_json::from_str::<serde_json::Value>(text).map_err(|_| "corrupt")?;
            if previous["schemaVersion"] != 1 {
                return Err("version-unsupported");
            }
            validate_nonsecret_keys(&previous)?;
            previous["revision"].as_u64().ok_or("corrupt")?
        }
    };
    if value["revision"].as_u64() != previous_revision.checked_add(1) {
        return Err("conflict");
    }
    let temporary = dir.join("client-state-v1.pending");
    let mut file = open_private(temporary.clone())?;
    file.set_len(0).map_err(|_| "write-failed")?;
    file.write_all(document.as_bytes())
        .and_then(|()| file.sync_all())
        .map_err(|_| "write-failed")?;
    drop(file);
    fs::rename(temporary, path).map_err(|_| "write-failed")?;
    #[cfg(unix)]
    File::open(&dir)
        .and_then(|file| file.sync_all())
        .map_err(|_| "write-failed")?;
    Ok(())
}

// Defense in depth at IPC: the feature decoder owns domain invariants, while the
// host refuses arbitrary fields (including credential envelopes) in its document.
fn validate_nonsecret_keys(value: &serde_json::Value) -> StorageResult<()> {
    fn keys(value: &serde_json::Value, allowed: &[&str]) -> StorageResult<()> {
        let object = value.as_object().ok_or("corrupt")?;
        if object.keys().any(|key| !allowed.contains(&key.as_str())) {
            return Err("corrupt");
        }
        Ok(())
    }
    keys(
        value,
        &[
            "schemaVersion",
            "revision",
            "serverProfiles",
            "accounts",
            "selectedAccountId",
        ],
    )?;
    let profiles = value["serverProfiles"].as_array().ok_or("corrupt")?;
    let accounts = value["accounts"].as_array().ok_or("corrupt")?;
    if profiles.len() > 100 || accounts.len() > 500 {
        return Err("corrupt");
    }
    for profile in profiles {
        keys(
            profile,
            &[
                "id",
                "canonicalUrl",
                "label",
                "discovery",
                "createdAt",
                "updatedAt",
            ],
        )?;
        keys(
            &profile["discovery"],
            &[
                "kind",
                "inspectedAt",
                "apiVersions",
                "authMethods",
                "registration",
                "legacyAcknowledgedAt",
            ],
        )?;
    }
    for account in accounts {
        keys(
            account,
            &[
                "id",
                "serverProfileId",
                "serverUserId",
                "username",
                "createdAt",
                "updatedAt",
            ],
        )?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn aliases_reject_paths_and_noncanonical_ids() {
        assert!(alias("../credentials").is_err());
        assert!(alias("00000000-0000-0000-0000-000000000000").is_err());
        assert!(alias("550e8400-e29b-41d4-7716-446655440000").is_err());
        assert!(alias("550E8400-E29B-41D4-A716-446655440000").is_err());
        let a = uuid::Uuid::new_v4().to_string();
        let b = uuid::Uuid::new_v4().to_string();
        assert_ne!(alias(&a).unwrap(), alias(&b).unwrap());
        assert!(alias(&a).unwrap().ends_with(&a));
    }
    #[test]
    fn metadata_rejects_secret_fields_at_ipc() {
        let mut value = serde_json::json!({"schemaVersion":1,"revision":1,"serverProfiles":[],"accounts":[],"selectedAccountId":null});
        assert!(validate_nonsecret_keys(&value).is_ok());
        value["accessToken"] = serde_json::json!("synthetic");
        assert!(validate_nonsecret_keys(&value).is_err());
    }
    #[test]
    fn file_replacement_is_durable_and_conflicts_preserve_previous_bytes() {
        let dir =
            std::env::temp_dir().join(format!("windwatcher-storage-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&dir).unwrap();
        let path = dir.join("client-state-v1.json");
        let document = serde_json::json!({"schemaVersion":1,"revision":1,"serverProfiles":[],"accounts":[],"selectedAccountId":null}).to_string();
        assert_eq!(read_document(path.clone()).unwrap(), None);
        write_document(dir.clone(), None, document.clone()).unwrap();
        assert_eq!(read_document(path.clone()).unwrap(), Some(document.clone()));
        assert_eq!(
            write_document(dir.clone(), None, document.clone()),
            Err("conflict")
        );
        assert_eq!(read_document(path.clone()).unwrap(), Some(document.clone()));
        let second = serde_json::json!({"schemaVersion":1,"revision":2,"serverProfiles":[],"accounts":[],"selectedAccountId":null}).to_string();
        write_document(dir.clone(), Some(document.clone()), second.clone()).unwrap();
        assert_eq!(read_document(path.clone()).unwrap(), Some(second));
        fs::write(&path, "{truncated").unwrap();
        assert_eq!(
            write_document(dir.clone(), Some("{truncated".into()), document),
            Err("corrupt")
        );
        assert_eq!(read_document(path).unwrap().as_deref(), Some("{truncated"));
        fs::remove_dir_all(dir).unwrap();
    }
}
