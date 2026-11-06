//! Opt-in OS-backend smoke; never a production command, route or diagnostic.
#[allow(dead_code)]
#[cfg(not(windows))]
#[path = "../../src-tauri/src/storage.rs"]
mod storage;
#[cfg(windows)]
#[path = "../windows-secrets/main.rs"]
mod windows_smoke;
#[cfg(not(windows))]
use std::{
    io::{Read, Write},
    process::{Command, Stdio},
};

#[cfg(windows)]
fn main() {
    windows_smoke::main();
}

#[cfg(not(windows))]
fn main() {
    if let Err(category) = run() {
        eprintln!("native storage smoke failed: {category}");
        std::process::exit(1);
    }
}

#[cfg(not(windows))]
fn run() -> Result<(), &'static str> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() == 3 {
        let id = args[2].clone();
        let mut bytes = Vec::new();
        std::io::stdin()
            .read_to_end(&mut bytes)
            .map_err(|_| "stdin")?;
        return match args[1].as_str() {
            "put" => storage::put_account_secret(id, bytes),
            "get" => {
                if storage::get_account_secret(id)? == Some(bytes) {
                    Ok(())
                } else {
                    Err("mismatch")
                }
            }
            "remove" => storage::remove_account_secret(id),
            "missing" => {
                if storage::get_account_secret(id)?.is_none() {
                    Ok(())
                } else {
                    Err("retained")
                }
            }
            _ => Err("arguments"),
        };
    }
    if args.len() != 1 {
        return Err("arguments");
    }
    let id = uuid::Uuid::new_v4().to_string();
    let first = uuid::Uuid::new_v4().as_bytes().to_vec();
    let second = uuid::Uuid::new_v4().as_bytes().to_vec();
    let result = (|| {
        for (action, bytes) in [
            ("missing", &first),
            ("put", &first),
            ("get", &first),
            ("put", &second),
            ("get", &second),
            ("remove", &second),
            ("remove", &second),
            ("missing", &second),
        ] {
            let mut child = Command::new(std::env::current_exe().map_err(|_| "executable")?)
                .args([action, &id])
                .stdin(Stdio::piped())
                .spawn()
                .map_err(|_| "spawn")?;
            child
                .stdin
                .take()
                .ok_or("stdin")?
                .write_all(bytes)
                .map_err(|_| "stdin")?;
            if !child.wait().map_err(|_| "wait")?.success() {
                return Err("backend");
            }
        }
        Ok(())
    })();
    storage::remove_account_secret(id)?;
    result?;
    println!(
        "OS secret write/restart/read/overwrite/remove/idempotence passed (no secret bytes logged)."
    );
    Ok(())
}
