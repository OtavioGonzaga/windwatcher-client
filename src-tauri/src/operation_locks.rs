//! Bounded, expiring owners of OS file locks. No secrets, arbitrary keys or filesystem IPC.
use std::{
    collections::HashMap,
    fs::{self, File, OpenOptions},
    path::Path,
    sync::{Arc, Condvar, Mutex},
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

type Result<T> = std::result::Result<T, &'static str>;
const TTL: Duration = Duration::from_secs(120);
struct Owned {
    key: String,
    file: Arc<File>,
    expires: Instant,
}
#[derive(Default)]
struct Entries {
    owned: HashMap<String, Owned>,
    stopping: bool,
}
#[derive(Default)]
struct Shared {
    entries: Mutex<Entries>,
    changed: Condvar,
}
pub struct OperationLocks {
    shared: Arc<Shared>,
    worker: Option<JoinHandle<()>>,
}
impl Default for OperationLocks {
    fn default() -> Self {
        let shared = Arc::new(Shared::default());
        let timer = Arc::clone(&shared);
        let worker = thread::Builder::new()
            .name("windwatcher-operation-expiry".into())
            .spawn(move || {
                let Ok(mut entries) = timer.entries.lock() else {
                    return;
                };
                loop {
                    if entries.stopping {
                        return;
                    }
                    let now = Instant::now();
                    entries.owned.retain(|_, entry| entry.expires > now);
                    timer.changed.notify_all();
                    let delay = entries
                        .owned
                        .values()
                        .map(|entry| entry.expires.saturating_duration_since(now))
                        .min()
                        .unwrap_or(TTL);
                    let Ok((next, _)) = timer.changed.wait_timeout(entries, delay) else {
                        return;
                    };
                    entries = next;
                }
            })
            .ok();
        Self { shared, worker }
    }
}
impl Drop for OperationLocks {
    fn drop(&mut self) {
        if let Ok(mut entries) = self.shared.entries.lock() {
            entries.stopping = true;
            entries.owned.clear();
            self.shared.changed.notify_all();
        }
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

fn canonical_uuid(value: &str, local: bool) -> bool {
    uuid::Uuid::parse_str(value).is_ok_and(|id| {
        id.to_string() == value
            && id.get_variant() == uuid::Variant::RFC4122
            && if local {
                id.get_version_num() == 4
            } else {
                (1..=8).contains(&id.get_version_num())
            }
    })
}
fn validate_key(key: &str) -> Result<()> {
    if key.len() > 96 {
        return Err("corrupt");
    }
    if key == "state" {
        return Ok(());
    }
    if let Some(id) = key.strip_prefix("profile-")
        && canonical_uuid(id, true)
    {
        return Ok(());
    }
    if let Some(id) = key.strip_prefix("account-")
        && canonical_uuid(id, true)
    {
        return Ok(());
    }
    if let Some(pair) = key.strip_prefix("identity-")
        && pair.len() == 73
        && pair.as_bytes()[36] == b'-'
        && canonical_uuid(&pair[..36], true)
        && canonical_uuid(&pair[37..], false)
    {
        return Ok(());
    }
    Err("corrupt")
}
fn file(root: &Path, key: &str) -> Result<Arc<File>> {
    validate_key(key)?;
    fs::create_dir_all(root).map_err(|_| "permission-denied")?;
    let path = root.join(format!("operation-{key}.lock"));
    if fs::symlink_metadata(&path).is_ok_and(|m| !m.is_file() || m.file_type().is_symlink()) {
        return Err("permission-denied");
    }
    let mut options = OpenOptions::new();
    options.read(true).write(true).create(true).truncate(false);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let file = options.open(path).map_err(|_| "permission-denied")?;
    file.try_lock().map_err(|_| "conflict")?;
    Ok(Arc::new(file))
}
impl OperationLocks {
    pub fn acquire(&self, root: &Path, key: &str) -> Result<String> {
        validate_key(key)?;
        if self.worker.is_none() {
            return Err("unavailable");
        }
        let mut entries = self.shared.entries.lock().map_err(|_| "unavailable")?;
        let owned = &mut entries.owned;
        owned.retain(|_, entry| entry.expires > Instant::now());
        if owned.len() >= 64 {
            return Err("quota");
        }
        if owned.values().any(|entry| entry.key == key) {
            return Err("conflict");
        }
        let file = file(root, key)?;
        let token = (0..10)
            .map(|_| uuid::Uuid::new_v4().to_string())
            .find(|id| !owned.contains_key(id))
            .ok_or("conflict")?;
        owned.insert(
            token.clone(),
            Owned {
                key: key.into(),
                file,
                expires: Instant::now() + TTL,
            },
        );
        self.shared.changed.notify_all();
        Ok(token)
    }
    pub fn guard(&self, root: &Path, key: &str, token: Option<&str>) -> Result<Arc<File>> {
        validate_key(key)?;
        if let Some(token) = token {
            let entries = self.shared.entries.lock().map_err(|_| "unavailable")?;
            let entry = entries.owned.get(token).ok_or("conflict")?;
            if entry.key != key || entry.expires <= Instant::now() {
                return Err("conflict");
            }
            return Ok(Arc::clone(&entry.file));
        }
        file(root, key)
    }
    pub fn check(&self, token: &str) -> Result<()> {
        let entries = self.shared.entries.lock().map_err(|_| "unavailable")?;
        if entries
            .owned
            .get(token)
            .is_none_or(|entry| entry.expires <= Instant::now())
        {
            return Err("conflict");
        }
        Ok(())
    }
    pub fn release(&self, token: &str) -> Result<()> {
        self.shared
            .entries
            .lock()
            .map_err(|_| "unavailable")?
            .owned
            .remove(token);
        self.shared.changed.notify_all();
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn owners_are_fenced_and_active_native_commands_keep_the_os_lock() {
        let root =
            std::env::temp_dir().join(format!("windwatcher-lock-test-{}", uuid::Uuid::new_v4()));
        let a = OperationLocks::default();
        let b = OperationLocks::default();
        let key = format!("account-{}", uuid::Uuid::new_v4());
        let token = a.acquire(&root, &key).unwrap();
        assert!(b.acquire(&root, &key).is_err());
        assert!(a.guard(&root, "state", Some(&token)).is_err());
        let command_guard = a.guard(&root, &key, Some(&token)).unwrap();
        a.shared
            .entries
            .lock()
            .unwrap()
            .owned
            .get_mut(&token)
            .unwrap()
            .expires = Instant::now();
        assert!(a.check(&token).is_err());
        assert!(a.guard(&root, &key, Some(&token)).is_err());
        assert!(b.acquire(&root, &key).is_err());
        a.release(&token).unwrap();
        assert!(b.acquire(&root, &key).is_err());
        drop(command_guard);
        let next = b.acquire(&root, &key).unwrap();
        assert!(a.guard(&root, &key, Some(&token)).is_err());
        b.release(&next).unwrap();
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn lock_keys_cannot_select_paths_or_unbounded_names() {
        for key in [
            "../state",
            "account-../secret",
            "profile-../secret",
            "profile-invalid",
            "identity-invalid",
            "state/other",
            "",
            "identity-💻",
        ] {
            assert!(validate_key(key).is_err());
        }
    }
    #[test]
    fn forgotten_owner_expires_without_any_further_renderer_call() {
        let root =
            std::env::temp_dir().join(format!("windwatcher-expiry-test-{}", uuid::Uuid::new_v4()));
        let a = OperationLocks::default();
        let b = OperationLocks::default();
        let key = format!("account-{}", uuid::Uuid::new_v4());
        let token = a.acquire(&root, &key).unwrap();
        let mut entries = a.shared.entries.lock().unwrap();
        entries.owned.get_mut(&token).unwrap().expires = Instant::now();
        a.shared.changed.notify_all();
        let (entries, timeout) = a
            .shared
            .changed
            .wait_timeout_while(entries, Duration::from_secs(5), |state| {
                state.owned.contains_key(&token)
            })
            .unwrap();
        assert!(!timeout.timed_out() && !entries.owned.contains_key(&token));
        drop(entries);
        let next = b.acquire(&root, &key).unwrap();
        assert!(a.guard(&root, &key, Some(&token)).is_err());
        b.release(&next).unwrap();
        fs::remove_dir_all(root).unwrap();
    }
}
