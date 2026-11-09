//! User-scoped DPAPI, one bounded ciphertext file per account. No raw errors or secrets in logs.
//! This module has no IPC or caller-selected filesystem capability.
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    os::windows::{ffi::OsStrExt, fs::MetadataExt, fs::OpenOptionsExt},
    path::{Path, PathBuf},
    ptr,
};
use windows_sys::Win32::{
    Foundation::LocalFree,
    Security::Cryptography::{
        CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN, CryptProtectData, CryptUnprotectData,
    },
    Storage::FileSystem::{
        FILE_ATTRIBUTE_REPARSE_POINT, FILE_FLAG_OPEN_REPARSE_POINT, MOVEFILE_REPLACE_EXISTING,
        MOVEFILE_WRITE_THROUGH, MoveFileExW,
    },
};
use zeroize::{Zeroize, Zeroizing};

type Result<T> = std::result::Result<T, &'static str>;
pub const MAX_SECRET_BYTES: usize = 16_384;
const MAX_FILE_BYTES: usize = 65_536;
const FILE_MAGIC: &[u8] = b"WWDP\x01";
const INNER_MAGIC: &[u8] = b"WWSR\x01";

struct LocalBlob(CRYPT_INTEGER_BLOB);
impl Drop for LocalBlob {
    fn drop(&mut self) {
        if !self.0.pbData.is_null() {
            // SAFETY: successful DPAPI output is an OS-owned allocation of cbData bytes.
            // Its plaintext/ciphertext is cleared before the matching LocalFree call.
            unsafe {
                std::slice::from_raw_parts_mut(self.0.pbData, self.0.cbData as usize).zeroize();
                LocalFree(self.0.pbData.cast());
            }
        }
    }
}

fn crypt(input: &[u8], context: &[u8], protect: bool) -> Result<Zeroizing<Vec<u8>>> {
    if input.is_empty() || input.len() > MAX_FILE_BYTES || context.len() > 256 {
        return Err("corrupt");
    }
    let data = CRYPT_INTEGER_BLOB {
        cbData: input.len() as u32,
        pbData: input.as_ptr().cast_mut(),
    };
    let entropy = CRYPT_INTEGER_BLOB {
        cbData: context.len() as u32,
        pbData: context.as_ptr().cast_mut(),
    };
    let mut output = LocalBlob(CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: ptr::null_mut(),
    });
    // SAFETY: all input slices remain live for the call, lengths are bounded to u32,
    // reserved/prompt/description pointers are null, and output is freed by LocalBlob.
    // No LOCAL_MACHINE flag: only the current user's DPAPI context protects the record.
    let ok = unsafe {
        if protect {
            CryptProtectData(
                &data,
                ptr::null(),
                &entropy,
                ptr::null(),
                ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output.0,
            )
        } else {
            CryptUnprotectData(
                &data,
                ptr::null_mut(),
                &entropy,
                ptr::null(),
                ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output.0,
            )
        }
    };
    if ok == 0 {
        // DPAPI cannot reliably distinguish corrupted data from lost user keys/profile.
        return Err("unavailable");
    }
    if output.0.pbData.is_null()
        || output.0.cbData == 0
        || output.0.cbData as usize > MAX_FILE_BYTES
    {
        return Err("corrupt");
    }
    // SAFETY: checked successful OS allocation, copied before LocalBlob clears/frees it.
    Ok(Zeroizing::new(unsafe {
        std::slice::from_raw_parts(output.0.pbData, output.0.cbData as usize).to_vec()
    }))
}

fn valid_id(id: &str) -> Result<()> {
    let uuid = uuid::Uuid::parse_str(id).map_err(|_| "corrupt")?;
    if uuid.get_version_num() != 4
        || uuid.get_variant() != uuid::Variant::RFC4122
        || uuid.to_string() != id
    {
        return Err("corrupt");
    }
    Ok(())
}

fn regular(metadata: &fs::Metadata, directory: bool) -> Result<()> {
    if metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
        || metadata.is_dir() != directory
        || (!directory && !metadata.is_file())
    {
        return Err("permission-denied");
    }
    Ok(())
}
fn inspect(path: &Path) -> Result<()> {
    match fs::symlink_metadata(path) {
        Ok(metadata) => regular(&metadata, false),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err("permission-denied"),
    }
}
fn open(path: &Path, write: bool) -> Result<File> {
    inspect(path)?;
    let file = OpenOptions::new()
        .read(true)
        .write(write)
        .create(write)
        .truncate(false)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT)
        .open(path)
        .map_err(|_| "permission-denied")?;
    regular(&file.metadata().map_err(|_| "unavailable")?, false)?;
    Ok(file)
}

/// Rust-owned path/namespace only. Production constructs this from app_local_data_dir.
pub struct RecordStore {
    root: PathBuf,
    namespace: String,
}
impl RecordStore {
    pub fn new(root: PathBuf, namespace: &str) -> Result<Self> {
        if namespace.is_empty() || namespace.len() > 128 || !namespace.is_ascii() {
            return Err("corrupt");
        }
        fs::create_dir_all(&root).map_err(|_| "permission-denied")?;
        regular(
            &fs::symlink_metadata(&root).map_err(|_| "permission-denied")?,
            true,
        )?;
        Ok(Self {
            root,
            namespace: namespace.to_owned(),
        })
    }
    fn context(&self, id: &str) -> Vec<u8> {
        // Public context binding, NOT a hardcoded encryption key. DPAPI owns all keys.
        format!("{}:dpapi:v1:{id}", self.namespace).into_bytes()
    }
    fn path(&self, id: &str, extension: &str) -> PathBuf {
        self.root.join(format!("{id}.{extension}"))
    }
    fn lock(&self, id: &str) -> Result<File> {
        valid_id(id)?;
        regular(
            &fs::symlink_metadata(&self.root).map_err(|_| "permission-denied")?,
            true,
        )?;
        let lock = open(&self.path(id, "lock"), true)?;
        // Short owned OS critical section; no blocking forever on another process.
        // Process death releases the OS lock; never delete lock files (inode races).
        lock.try_lock().map_err(|_| "conflict")?;
        Ok(lock)
    }
    fn read_unlocked(&self, id: &str) -> Result<Option<Zeroizing<Vec<u8>>>> {
        let path = self.path(id, "record");
        inspect(&path)?;
        let file = match OpenOptions::new()
            .read(true)
            .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT)
            .open(path)
        {
            Ok(file) => file,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(_) => return Err("permission-denied"),
        };
        regular(&file.metadata().map_err(|_| "unavailable")?, false)?;
        let mut encoded = Vec::new();
        file.take((MAX_FILE_BYTES + 1) as u64)
            .read_to_end(&mut encoded)
            .map_err(|_| "corrupt")?;
        if encoded.len() > MAX_FILE_BYTES || encoded.len() <= FILE_MAGIC.len() {
            return Err("corrupt");
        }
        if !encoded.starts_with(FILE_MAGIC) {
            return Err("version-unsupported");
        }
        let context = self.context(id);
        let plain = crypt(&encoded[FILE_MAGIC.len()..], &context, false)?;
        let prefix = INNER_MAGIC.len() + 4;
        if plain.len() < prefix + 32 || !plain.starts_with(INNER_MAGIC) {
            return Err("corrupt");
        }
        let size = u32::from_le_bytes(
            plain[INNER_MAGIC.len()..prefix]
                .try_into()
                .map_err(|_| "corrupt")?,
        ) as usize;
        if size == 0 || size > MAX_SECRET_BYTES || plain.len() != prefix + size + 32 {
            return Err("corrupt");
        }
        let mut digest = Sha256::new()
            .chain_update(&context)
            .chain_update(&plain[..prefix + size])
            .finalize();
        let valid = digest[..] == plain[prefix + size..];
        digest[..].zeroize();
        if !valid {
            return Err("corrupt");
        }
        Ok(Some(Zeroizing::new(plain[prefix..prefix + size].to_vec())))
    }
    pub fn get(&self, id: &str) -> Result<Option<Vec<u8>>> {
        let _lock = self.lock(id)?;
        Ok(self.read_unlocked(id)?.map(|record| record.to_vec()))
    }
    pub fn put(&self, id: &str, record: &[u8]) -> Result<()> {
        self.put_with_checkpoint(id, record, || Ok(()))
    }
    // Rust-only fault seam used by the opt-in CLI/unit tests. Production always passes
    // a no-op closure; no crash action, sleep, diagnostic or additional IPC ships.
    pub(crate) fn put_with_checkpoint(
        &self,
        id: &str,
        record: &[u8],
        checkpoint: impl FnOnce() -> Result<()>,
    ) -> Result<()> {
        if record.is_empty() {
            return Err("corrupt");
        }
        if record.len() > MAX_SECRET_BYTES {
            return Err("too-large");
        }
        let _lock = self.lock(id)?;
        let context = self.context(id);
        let mut plain = Zeroizing::new(Vec::with_capacity(record.len() + INNER_MAGIC.len() + 36));
        plain.extend_from_slice(INNER_MAGIC);
        plain.extend_from_slice(&(record.len() as u32).to_le_bytes());
        plain.extend_from_slice(record);
        let mut digest = Sha256::new()
            .chain_update(&context)
            .chain_update(&*plain)
            .finalize();
        plain.extend_from_slice(&digest);
        digest[..].zeroize();
        let encrypted = crypt(&plain, &context, true)?;
        if encrypted.len() + FILE_MAGIC.len() > MAX_FILE_BYTES {
            return Err("too-large");
        }
        let pending = self.path(id, "pending");
        let target = self.path(id, "record");
        inspect(&target)?;
        let mut file = open(&pending, true)?;
        file.set_len(0).map_err(|_| "write-failed")?;
        file.write_all(FILE_MAGIC)
            .and_then(|()| file.write_all(&encrypted))
            .and_then(|()| file.sync_all())
            .map_err(|_| "write-failed")?;
        drop(file);
        checkpoint()?;
        inspect(&target)?;
        let pending_wide: Vec<u16> = pending.as_os_str().encode_wide().chain(Some(0)).collect();
        let target_wide: Vec<u16> = target.as_os_str().encode_wide().chain(Some(0)).collect();
        // SAFETY: live NUL-terminated Rust-owned fixed paths; same-directory replacement.
        if unsafe {
            MoveFileExW(
                pending_wide.as_ptr(),
                target_wide.as_ptr(),
                MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
            )
        } == 0
        {
            return Err("write-failed");
        }
        // Verify the complete persisted record, not just success from the encryption API.
        let verified = self.read_unlocked(id)?.ok_or("write-failed")?;
        if verified.as_slice() != record {
            return Err("write-failed");
        }
        Ok(())
    }
    pub fn remove(&self, id: &str) -> Result<()> {
        let _lock = self.lock(id)?;
        for extension in ["pending", "record"] {
            let path = self.path(id, extension);
            inspect(&path)?;
            match fs::remove_file(path) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(_) => return Err("write-failed"),
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn interrupted_replacement_preserves_the_previous_record_and_ignores_pending() {
        let root =
            std::env::temp_dir().join(format!("windwatcher-dpapi-test-{}", uuid::Uuid::new_v4()));
        let store = RecordStore::new(root.clone(), "windwatcher-client.tests").unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        let first = Zeroizing::new(vec![0x51; 3321]);
        store.put(&id, &first).unwrap();
        assert!(
            store
                .put_with_checkpoint(&id, &[0x72; 16384], || Err("write-failed"))
                .is_err()
        );
        let retained = Zeroizing::new(store.get(&id).unwrap().unwrap());
        assert!(
            retained.as_slice() == first.as_slice(),
            "retained record mismatch (bytes suppressed)"
        );
        assert!(store.path(&id, "pending").exists());
        store.remove(&id).unwrap();
        assert!(store.get(&id).unwrap().is_none());
        fs::remove_dir_all(root).unwrap();
    }
}
