//! Fixed app-data document and Rust-only OS credential access. Never log backend errors.
use crate::operation_locks::OperationLocks;
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::PathBuf,
};
use tauri::Manager;
#[cfg(not(windows))]
use tauri_plugin_keyring_store::{Error, KeyringStore};
#[cfg(windows)]
#[path = "storage/windows_dpapi.rs"]
mod windows_dpapi;

type StorageResult<T> = Result<T, &'static str>;
const MAX_DOCUMENT: u64 = 1_048_576;
const MAX_SECRET: usize = 16_384;

fn validate_write_size(length: usize) -> StorageResult<()> {
    if length == 0 {
        return Err("corrupt");
    }
    if length > MAX_SECRET {
        return Err("too-large");
    }
    Ok(())
}
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

#[cfg(not(windows))]
fn safe_error(error: Error) -> &'static str {
    match error {
        Error::KeychainLocked => "locked",
        Error::Encoding(_) => "corrupt",
        _ => "unavailable",
    }
}

#[cfg(not(windows))]
pub(crate) fn get_secret_raw(account_id: &str) -> StorageResult<Option<Vec<u8>>> {
    let record = KeyringStore::new(SERVICE)
        .get_bytes(&alias(account_id)?)
        .map_err(safe_error)?;
    if record
        .as_ref()
        .is_some_and(|bytes| bytes.is_empty() || bytes.len() > MAX_SECRET)
    {
        return Err("corrupt");
    }
    Ok(record)
}

#[cfg(not(windows))]
pub(crate) fn put_secret_raw(account_id: &str, record: &[u8]) -> StorageResult<()> {
    validate_write_size(record.len())?;
    KeyringStore::new(SERVICE)
        .set_bytes(&alias(account_id)?, record)
        .map_err(safe_error)
}

#[cfg(not(windows))]
pub(crate) fn remove_secret_raw(account_id: &str) -> StorageResult<()> {
    KeyringStore::new(SERVICE)
        .delete(&alias(account_id)?)
        .map_err(safe_error)
}

#[cfg(windows)]
fn windows_secrets(app: &tauri::AppHandle) -> StorageResult<windows_dpapi::RecordStore> {
    let root = app.path().app_local_data_dir().map_err(|_| "unavailable")?;
    #[cfg(feature = "storage-smoke")]
    let root = root.join("storage-smoke");
    windows_dpapi::RecordStore::new(root.join("account-secrets-dpapi-v1"), SERVICE)
}

#[tauri::command(async)]
pub fn get_account_secret(
    app: tauri::AppHandle,
    locks: tauri::State<'_, OperationLocks>,
    account_id: String,
    lease_id: Option<String>,
) -> StorageResult<Option<Vec<u8>>> {
    alias(&account_id)?;
    let _guard = locks.guard(
        &directory(&app)?,
        &format!("account-{account_id}"),
        lease_id.as_deref(),
    )?;
    #[cfg(windows)]
    {
        windows_secrets(&app)?.get(&account_id)
    }
    #[cfg(not(windows))]
    {
        get_secret_raw(&account_id)
    }
}

#[tauri::command(async)]
pub fn put_account_secret(
    app: tauri::AppHandle,
    locks: tauri::State<'_, OperationLocks>,
    account_id: String,
    record: Vec<u8>,
    lease_id: Option<String>,
) -> StorageResult<()> {
    alias(&account_id)?;
    let record = zeroize::Zeroizing::new(record);
    validate_write_size(record.len())?;
    let _guard = locks.guard(
        &directory(&app)?,
        &format!("account-{account_id}"),
        lease_id.as_deref(),
    )?;
    #[cfg(windows)]
    {
        windows_secrets(&app)?.put(&account_id, &record)
    }
    #[cfg(not(windows))]
    {
        put_secret_raw(&account_id, &record)
    }
}

#[tauri::command(async)]
pub fn remove_account_secret(
    app: tauri::AppHandle,
    locks: tauri::State<'_, OperationLocks>,
    account_id: String,
    lease_id: Option<String>,
) -> StorageResult<()> {
    alias(&account_id)?;
    let _guard = locks.guard(
        &directory(&app)?,
        &format!("account-{account_id}"),
        lease_id.as_deref(),
    )?;
    #[cfg(windows)]
    {
        windows_secrets(&app)?.remove(&account_id)
    }
    #[cfg(not(windows))]
    {
        remove_secret_raw(&account_id)
    }
}

#[tauri::command(async)]
pub fn acquire_storage_operation(
    app: tauri::AppHandle,
    locks: tauri::State<'_, OperationLocks>,
    key: String,
) -> StorageResult<String> {
    locks.acquire(&directory(&app)?, &key)
}
#[tauri::command(async)]
pub fn check_storage_operation(
    locks: tauri::State<'_, OperationLocks>,
    lease_id: String,
) -> StorageResult<()> {
    locks.check(&lease_id)
}
#[tauri::command(async)]
pub fn release_storage_operation(
    locks: tauri::State<'_, OperationLocks>,
    lease_id: String,
) -> StorageResult<()> {
    locks.release(&lease_id)
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
    locks: tauri::State<'_, OperationLocks>,
    expected: Option<String>,
    document: String,
    lease_id: Option<String>,
) -> StorageResult<()> {
    let _guard = locks.guard(&directory(&app)?, "state", lease_id.as_deref())?;
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
    if value["schemaVersion"] != 1 && value["schemaVersion"] != 2 {
        return Err("version-unsupported");
    }
    validate_nonsecret_keys(&value)?;
    let previous_revision = match &expected {
        None => 0,
        Some(text) => {
            let previous =
                serde_json::from_str::<serde_json::Value>(text).map_err(|_| "corrupt")?;
            if previous["schemaVersion"] != 1 && previous["schemaVersion"] != 2 {
                return Err("version-unsupported");
            }
            if previous["schemaVersion"] == 2 && value["schemaVersion"] == 1 {
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
    let v2 = value["schemaVersion"] == 2;
    if v2 {
        keys(
            value,
            &[
                "schemaVersion",
                "revision",
                "serverProfiles",
                "accounts",
                "selectedAccountId",
                "authOperations",
            ],
        )?;
    } else {
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
    }
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
        let mut allowed = vec![
            "id",
            "serverProfileId",
            "serverUserId",
            "username",
            "createdAt",
            "updatedAt",
        ];
        if v2 {
            allowed.push("session");
        }
        keys(account, &allowed)?;
        if let Some(session) = account.get("session") {
            keys(session, &["generation", "sessionId", "operationId"])?;
            validate_generation(&session["generation"], false)?;
            validate_uuid(&session["sessionId"], false)?;
            validate_uuid(&session["operationId"], true)?;
        }
    }
    if v2 {
        let intents = value["authOperations"].as_array().ok_or("corrupt")?;
        if intents.len() > 500 {
            return Err("corrupt");
        }
        for intent in intents {
            keys(
                intent,
                &[
                    "accountId",
                    "profileId",
                    "userId",
                    "sessionId",
                    "operationId",
                    "kind",
                    "phase",
                    "expectedGeneration",
                    "targetGeneration",
                    "startedAt",
                ],
            )?;
            for name in ["accountId", "profileId", "operationId"] {
                validate_uuid(&intent[name], true)?;
            }
            for name in ["userId", "sessionId"] {
                validate_uuid(&intent[name], false)?;
            }
            if !matches!(
                intent["kind"].as_str(),
                Some("create" | "replace" | "refresh")
            ) || !matches!(
                intent["phase"].as_str(),
                Some("prepared" | "sent" | "recovery-required")
            ) {
                return Err("corrupt");
            }
            validate_generation(&intent["expectedGeneration"], true)?;
            validate_generation(&intent["targetGeneration"], false)?;
            if intent["targetGeneration"].as_u64() <= intent["expectedGeneration"].as_u64() {
                return Err("corrupt");
            }
            let at = intent["startedAt"].as_str().ok_or("corrupt")?;
            if at.len() != 24
                || !at.bytes().enumerate().all(|(i, c)| match i {
                    4 | 7 => c == b'-',
                    10 => c == b'T',
                    13 | 16 => c == b':',
                    19 => c == b'.',
                    23 => c == b'Z',
                    _ => c.is_ascii_digit(),
                })
            {
                return Err("corrupt");
            }
            if !profiles.iter().any(|p| p["id"] == intent["profileId"]) {
                return Err("corrupt");
            }
        }
    }
    Ok(())
}
fn validate_uuid(value: &serde_json::Value, local: bool) -> StorageResult<()> {
    let text = value.as_str().ok_or("corrupt")?;
    let id = uuid::Uuid::parse_str(text).map_err(|_| "corrupt")?;
    if id.to_string() != text
        || id.get_variant() != uuid::Variant::RFC4122
        || if local {
            id.get_version_num() != 4
        } else {
            !(1..=8).contains(&id.get_version_num())
        }
    {
        return Err("corrupt");
    }
    Ok(())
}
fn validate_generation(value: &serde_json::Value, zero: bool) -> StorageResult<()> {
    let n = value.as_u64().ok_or("corrupt")?;
    if n > 9_007_199_254_740_991 || (!zero && n == 0) {
        return Err("corrupt");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn version_two_intents_are_nonsecret_and_downgrades_preserve_state() {
        let dir =
            std::env::temp_dir().join(format!("windwatcher-v2-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&dir).unwrap();
        let v1 = serde_json::json!({"schemaVersion":1,"revision":1,"serverProfiles":[],"accounts":[],"selectedAccountId":null}).to_string();
        write_document(dir.clone(), None, v1.clone()).unwrap();
        let v2 = serde_json::json!({"schemaVersion":2,"revision":2,"serverProfiles":[],"accounts":[],"selectedAccountId":null,"authOperations":[]}).to_string();
        write_document(dir.clone(), Some(v1), v2.clone()).unwrap();
        let downgrade = serde_json::json!({"schemaVersion":1,"revision":3,"serverProfiles":[],"accounts":[],"selectedAccountId":null}).to_string();
        assert_eq!(
            write_document(dir.clone(), Some(v2.clone()), downgrade),
            Err("version-unsupported")
        );
        assert_eq!(
            read_document(dir.join("client-state-v1.json")).unwrap(),
            Some(v2)
        );
        let mut secret = serde_json::json!({"schemaVersion":2,"revision":3,"serverProfiles":[],"accounts":[],"selectedAccountId":null,"authOperations":[{"refreshToken":"synthetic"}]});
        assert_eq!(validate_nonsecret_keys(&secret), Err("corrupt"));
        secret["authOperations"] = serde_json::json!([]);
        assert!(validate_nonsecret_keys(&secret).is_ok());
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn native_opaque_record_size_is_checked_before_provider_writes() {
        assert_eq!(validate_write_size(0), Err("corrupt"));
        assert_eq!(validate_write_size(961), Ok(()));
        assert_eq!(validate_write_size(MAX_SECRET), Ok(()));
        assert_eq!(validate_write_size(MAX_SECRET + 1), Err("too-large"));
        assert_eq!(validate_write_size(usize::MAX), Err("too-large"));
    }
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
