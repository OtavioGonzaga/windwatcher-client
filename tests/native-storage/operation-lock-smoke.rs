//! Real OS-process death/exclusion fixture; no vault access or production IPC.
#[cfg(not(debug_assertions))]
compile_error!("Operation lock smoke is debug-only.");
#[path = "../../src-tauri/src/operation_locks.rs"]
mod operation_locks;
use operation_locks::OperationLocks;
use std::{
    io::{BufRead, BufReader, Write},
    process::{Command, Stdio},
};

fn main() {
    if let Err(category) = run() {
        eprintln!("Native operation-lock smoke failed ({category}).");
        std::process::exit(1);
    }
}
fn run() -> Result<(), &'static str> {
    let args: Vec<_> = std::env::args().collect();
    if args.len() == 4 && args[1] == "own" {
        let locks = OperationLocks::default();
        let root = std::path::Path::new(&args[2]);
        let token = locks.acquire(root, &args[3])?;
        locks.check(&token)?;
        let _guard = locks.guard(root, &args[3], Some(&token))?;
        println!("operation-lock-acquired");
        std::io::stdout().flush().map_err(|_| "stdout")?;
        loop {
            std::thread::park();
        }
    }
    if args.len() != 1 {
        return Err("arguments");
    }
    for kind in ["account", "profile"] {
        let root = std::env::temp_dir().join(format!(
            "windwatcher-operation-smoke-{}",
            uuid::Uuid::new_v4()
        ));
        let key = format!("{kind}-{}", uuid::Uuid::new_v4());
        let other = format!("{kind}-{}", uuid::Uuid::new_v4());
        let mut child = Command::new(std::env::current_exe().map_err(|_| "executable")?)
            .arg("own")
            .arg(&root)
            .arg(&key)
            .stdout(Stdio::piped())
            .spawn()
            .map_err(|_| "spawn")?;
        let locks = OperationLocks::default();
        let result = (|| {
            let mut ready = String::new();
            BufReader::new(child.stdout.take().ok_or("stdout")?)
                .read_line(&mut ready)
                .map_err(|_| "stdout")?;
            if ready.trim() != "operation-lock-acquired" {
                return Err("owner-not-ready");
            }
            if locks.acquire(&root, &key) != Err("conflict") {
                return Err("duplicate-owner");
            }
            let unrelated = locks.acquire(&root, &other)?;
            locks.check(&unrelated)?;
            locks.release(&unrelated)?;
            Ok(())
        })();
        let killed = child.kill().map_err(|_| "kill");
        let waited = child.wait().map_err(|_| "wait");
        let recovery = (|| {
            result?;
            killed?;
            waited?;
            let token = locks.acquire(&root, &key)?;
            locks.check(&token)?;
            locks.release(&token)?;
            if locks.guard(&root, &key, Some(&token)).is_ok() {
                return Err("stale-owner");
            }
            Ok(())
        })();
        std::fs::remove_dir_all(&root).map_err(|_| "cleanup")?;
        recovery?;
    }
    println!(
        "Native operation locks: cross-process exclusion, account/profile isolation, process-death recovery and stale-owner fencing passed."
    );
    Ok(())
}
