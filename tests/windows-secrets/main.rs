//! Runs ONLY on real Windows with storage-smoke; uses the exact production DPAPI module.
//! Every credential operation is a separate process; only fixed stage text is printed.
#[cfg(not(debug_assertions))]
compile_error!("The Windows secret smoke must not ship in release builds.");
#[path = "../../src-tauri/src/storage/windows_dpapi.rs"]
mod windows_dpapi;
use std::{
    fs,
    io::{BufRead, BufReader, Read, Write},
    path::Path,
    process::{Command, Stdio},
};
use windows_dpapi::{MAX_SECRET_BYTES, RecordStore};
use zeroize::Zeroizing;

const NAMESPACE: &str = "windwatcher-client.windows-ci.dpapi.v1";

pub fn main() {
    if let Err(category) = run() {
        eprintln!("Windows DPAPI storage smoke failed: {category} (bytes suppressed).");
        std::process::exit(1);
    }
}
fn run() -> Result<(), &'static str> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() == 4 {
        let id = &args[3];
        let namespace = if args[1] == "wrong-context" {
            "windwatcher-client.other-context"
        } else {
            NAMESPACE
        };
        let store = RecordStore::new(std::path::PathBuf::from(&args[2]), namespace)?;
        let mut input = Zeroizing::new(Vec::new());
        std::io::stdin()
            .take((MAX_SECRET_BYTES + 2) as u64)
            .read_to_end(&mut input)
            .map_err(|_| "stdin")?;
        return match args[1].as_str() {
            "put" => store.put(id, &input),
            "get" => {
                let actual = Zeroizing::new(store.get(id)?.ok_or("missing")?);
                if actual.as_slice() == input.as_slice() {
                    Ok(())
                } else {
                    Err("mismatch")
                }
            }
            "remove" => store.remove(id),
            "missing" => {
                if store.get(id)?.is_none() {
                    Ok(())
                } else {
                    Err("retained")
                }
            }
            "too-large" => {
                if store.put(id, &input) == Err("too-large") {
                    Ok(())
                } else {
                    Err("capacity")
                }
            }
            "empty" => {
                if store.put(id, &[]) == Err("corrupt") {
                    Ok(())
                } else {
                    Err("empty")
                }
            }
            "blocked-put" => {
                if store.put(id, &input).is_err() {
                    Ok(())
                } else {
                    Err("write-succeeded")
                }
            }
            "blocked-remove" => {
                if store.remove(id).is_err() {
                    Ok(())
                } else {
                    Err("remove-succeeded")
                }
            }
            "get-error" | "wrong-context" => match store.get(id) {
                Err("unavailable" | "corrupt" | "version-unsupported") => Ok(()),
                _ => Err("corruption-not-rejected"),
            },
            "invalid-id" => {
                if matches!(store.get(id), Err("corrupt")) {
                    Ok(())
                } else {
                    Err("invalid-id")
                }
            }
            "park" => store.put_with_checkpoint(id, &input, || {
                println!("pending-flushed");
                std::io::stdout().flush().map_err(|_| "stdout")?;
                loop {
                    std::thread::park();
                }
            }),
            _ => Err("arguments"),
        };
    }
    if args.len() != 1 {
        return Err("arguments");
    }
    let root =
        std::env::temp_dir().join(format!("windwatcher-windows-ci-{}", uuid::Uuid::new_v4()));
    let id = uuid::Uuid::new_v4().to_string();
    let other = uuid::Uuid::new_v4().to_string();
    let result = exercise(&root, &id, &other);
    // Only this invocation's isolated ciphertext/lock sandbox, never a user's app data.
    if root.exists() {
        fs::remove_dir_all(&root).map_err(|_| "cleanup")?;
    }
    result?;
    println!(
        "Windows DPAPI real-OS capacity/restart/overwrite/isolation/corruption/crash/leak checks passed."
    );
    Ok(())
}
fn command(root: &Path, id: &str, action: &str) -> Result<Command, &'static str> {
    let mut command = Command::new(std::env::current_exe().map_err(|_| "executable")?);
    command.arg(action).arg(root).arg(id).stdin(Stdio::piped());
    Ok(command)
}
fn child(root: &Path, id: &str, action: &str, bytes: &[u8]) -> Result<(), &'static str> {
    let mut child = command(root, id, action)?.spawn().map_err(|_| "spawn")?;
    child
        .stdin
        .take()
        .ok_or("stdin")?
        .write_all(bytes)
        .map_err(|_| "stdin")?;
    if !child.wait().map_err(|_| "wait")?.success() {
        return Err("child");
    }
    Ok(())
}
fn killed_writer(root: &Path, id: &str, bytes: &[u8]) -> Result<(), &'static str> {
    let mut child = command(root, id, "park")?
        .stdout(Stdio::piped())
        .spawn()
        .map_err(|_| "spawn")?;
    let result = (|| {
        child
            .stdin
            .take()
            .ok_or("stdin")?
            .write_all(bytes)
            .map_err(|_| "stdin")?;
        let mut ready = String::new();
        BufReader::new(child.stdout.take().ok_or("stdout")?)
            .read_line(&mut ready)
            .map_err(|_| "stdout")?;
        if ready.trim() != "pending-flushed" {
            return Err("checkpoint");
        }
        // A second process must fail closed while the first still owns the OS lock.
        let probe = RecordStore::new(root.to_owned(), NAMESPACE)?;
        if !matches!(probe.get(id), Err("conflict")) {
            return Err("lock-not-exclusive");
        }
        Ok(())
    })();
    let killed = child.kill().map_err(|_| "kill");
    let waited = child.wait().map_err(|_| "wait");
    result?;
    killed?;
    waited?;
    Ok(())
}
fn no_plaintext(root: &Path) -> Result<(), &'static str> {
    for entry in fs::read_dir(root).map_err(|_| "scan")? {
        let path = entry.map_err(|_| "scan")?.path();
        if path.is_dir() {
            return Err("unexpected-directory");
        }
        let bytes = fs::read(path).map_err(|_| "scan")?;
        // Synthetic input consists of repeated B/C bytes. Check raw and Base64 fragments.
        for marker in [
            b"BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB".as_slice(),
            b"CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
            b"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
            b"QkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJC",
            b"Q0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0ND",
        ] {
            if bytes.windows(marker.len()).any(|window| window == marker) {
                return Err("plaintext-leak");
            }
        }
    }
    Ok(())
}
fn exercise(root: &Path, id: &str, other: &str) -> Result<(), &'static str> {
    for invalid in [
        "../outside",
        "00000000-0000-0000-0000-000000000000",
        "550E8400-E29B-41D4-A716-446655440000",
    ] {
        child(root, invalid, "invalid-id", b"")?;
    }
    child(root, id, "missing", b"")?;
    // Cover the former exact limit, actual long-issuer grant sizes, maximum JWT envelope,
    // the complete supported opaque record bound, and non-UTF8 bytes in a later sample.
    for length in [1, 960, 961, 1273, 3321, 8530, MAX_SECRET_BYTES] {
        let first = Zeroizing::new(vec![b'B'; length]);
        let second = Zeroizing::new(vec![b'C'; length]);
        child(root, id, "put", &first)?;
        child(root, id, "get", &first)?;
        child(root, other, "missing", b"")?;
        child(root, id, "put", &second)?;
        child(root, id, "get", &second)?;
        no_plaintext(root)?;
    }
    println!("Windows DPAPI new/overwrite/readback in separate processes: 1..16384 bytes passed.");
    let retained = Zeroizing::new(vec![b'C'; MAX_SECRET_BYTES]);
    child(root, id, "too-large", &vec![b'B'; MAX_SECRET_BYTES + 1])?;
    child(root, id, "empty", b"")?;
    child(root, id, "get", &retained)?;
    let path = root.join(format!("{id}.record"));
    let original = fs::read(&path).map_err(|_| "snapshot")?;
    child(root, id, "wrong-context", b"")?;
    if fs::read(&path).map_err(|_| "snapshot")? != original {
        return Err("error-mutated-record");
    }
    let other_path = root.join(format!("{other}.record"));
    fs::write(&other_path, &original).map_err(|_| "fixture")?;
    child(root, other, "get-error", b"")?;
    child(root, id, "get", &retained)?;
    child(root, other, "remove", b"")?;
    let mut corrupt = original.clone();
    let middle = corrupt.len() / 2;
    corrupt[middle] ^= 0xff;
    for damaged in [
        corrupt,
        b"WWDP\x02future".to_vec(),
        Vec::new(),
        vec![0x45; 65_537],
    ] {
        fs::write(&path, &damaged).map_err(|_| "fixture")?;
        child(root, id, "get-error", b"")?;
        if fs::read(&path).map_err(|_| "snapshot")? != damaged {
            return Err("error-mutated-record");
        }
    }
    fs::write(&path, &original).map_err(|_| "fixture")?;
    child(root, id, "get", &retained)?;
    let pending = root.join(format!("{id}.pending"));
    fs::create_dir(&pending).map_err(|_| "fixture")?;
    child(root, id, "blocked-put", b"synthetic blocked replacement")?;
    child(root, id, "blocked-remove", b"")?;
    child(root, id, "get", &retained)?;
    fs::remove_dir(&pending).map_err(|_| "fixture")?;
    println!(
        "Windows DPAPI capacity/identity/context/corruption/blocked-I/O failures preserve records."
    );
    let replacement = Zeroizing::new(vec![b'B'; 3321]);
    killed_writer(root, id, &replacement)?;
    child(root, id, "get", &retained)?; // Pending is never promoted after process death.
    killed_writer(root, other, &replacement)?;
    child(root, other, "missing", b"")?; // Initial interrupted put creates no false success.
    no_plaintext(root)?;
    child(root, other, "remove", b"")?;
    child(root, id, "put", &replacement)?;
    child(root, id, "get", &replacement)?;
    let envelope = Zeroizing::new(
        serde_json::to_vec(&serde_json::json!([
            1,
            id,
            other,
            "019a0000-0000-7000-8000-000000000001",
            uuid::Uuid::new_v4().to_string(),
            9_007_199_254_740_991u64,
            "019a0000-0000-7000-8000-000000000002",
            "Bearer",
            format!("a.{}.b", "B".repeat(8188)),
            "A".repeat(43),
            "2026-11-06T12:15:00.123456789Z",
            "2026-12-06T12:00:00.123456789Z"
        ]))
        .map_err(|_| "fixture")?,
    );
    if envelope.len() <= 8192 || envelope.len() > MAX_SECRET_BYTES {
        return Err("fixture-size");
    }
    child(root, id, "put", &envelope)?;
    child(root, id, "get", &envelope)?;
    no_plaintext(root)?;
    child(root, id, "put", &replacement)?;
    let binary = Zeroizing::new((0u8..=255).cycle().take(3321).collect::<Vec<_>>());
    child(root, other, "put", &binary)?;
    child(root, other, "get", &binary)?;
    child(root, id, "get", &replacement)?;
    child(root, other, "remove", b"")?;
    child(root, id, "remove", b"")?;
    child(root, id, "remove", b"")?;
    child(root, id, "missing", b"")?;
    no_plaintext(root)?;
    Ok(())
}
