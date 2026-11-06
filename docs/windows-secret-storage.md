# Windows account secrets: user-scoped DPAPI

## Scope and source review

The Windows secret adapter now uses `CryptProtectData` / `CryptUnprotectData`
directly, not keyring-store's Base64/UTF-16 Credential Manager route. Linux and
Android retain their reviewed OS backends. No production authentication UI or
cross-store session coordinator is enabled by this change.

Reviewed on 2026-11-06:

- [CryptProtectData](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata):
  current-user scope without `CRYPTPROTECT_LOCAL_MACHINE`, UI suppression,
  optional entropy, OS allocation ownership and MAC protection.
- [CryptUnprotectData](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptunprotectdata):
  matching user/context requirements, key/profile loss, error ambiguity and
  application-level validation of decrypted data rather than relying on one
  particular tamper error.
- Pinned `windows-sys` 0.61.2 FFI signatures, `LocalFree`, `MoveFileExW` and
  file flags. The existing lockfile already contains this MIT/Apache-2.0 package,
  `sha2` 0.10.9 and `zeroize` 1.9.1; they are now direct Windows-only dependencies.
  No bundled crypto service, plugin command handler or generic filesystem API is added.

This is a focused integration review, not an independent security audit.
See [ADR 0008](adr/0008-windows-user-scoped-dpapi-records.md).

## Record, limits and identity binding

Rust resolves a fixed `account-secrets-dpapi-v1/` directory below Tauri's
**local** app-data directory, not roaming app data. Files are derived solely from
canonical local UUIDv4 account IDs: `<id>.record`, `<id>.pending`, `<id>.lock`.
The frontend still has only the existing account-ID get/put/remove commands;
it cannot supply a path, encryption key, service name, namespace or export destination.
The smoke frontend uses an additional fixed `storage-smoke/` isolation directory.

The complete opaque credential envelope is one record, **1..16384 bytes**.
It is neither truncated nor divided into independent access/refresh entries.
The ciphertext file starts with `WWDP` + version byte `1`; the remaining bytes
are the binary DPAPI blob. The bounded decrypted content is:

```text
"WWSR" + version byte 1 + uint32le(record length) + record + SHA256(context || preceding plaintext)
```

The digest is an internal corruption/format check **inside** the protected blob,
not a plaintext refresh fingerprint, journal value or substitute for DPAPI's
protection. The context is the fixed service namespace + `:dpapi:v1:` + full account
UUID, also passed as DPAPI optional entropy. It is **public binding data**, not a
hardcoded key. Copying a ciphertext to another account or service must fail closed.
DPAPI supplies all encryption keys. `CRYPTPROTECT_UI_FORBIDDEN` is set and
`CRYPTPROTECT_LOCAL_MACHINE` is never set.

The adapter caps ciphertext files at 64 KiB before decryption and validates the
version, decrypted length and digest before returning any bytes. Empty/oversized
input is rejected before record I/O. Unknown versions and damaged records remain
on disk. Native allocated buffers and owned intermediate plaintext use explicit
zeroization; returned IPC bytes and JavaScript strings cannot be claimed securely
erasable. No plaintext is written to any file, log or diagnostic output.

## Filesystem and failure semantics

Each operation owns a short OS file lock for the account. A competitor receives
`conflict` rather than waiting indefinitely; process death releases the lock.
Inert lock files remain to avoid deletion/recreation races. This serializes
**individual secret operations only**, not remote refresh, metadata updates or
cross-store transactions. PR 8's application-level coordination/journal is still required.

A put encrypts first, writes **only ciphertext** to `.pending`, flushes it, then
uses same-directory `MoveFileExW(REPLACE_EXISTING | WRITE_THROUGH)`. It reads,
decrypts and compares the entire persisted record before returning success.
An interrupted pending file is never promoted automatically. A future put can
replace it, and remove deletes pending ciphertext before the established record.
Failed pre-commit writes preserve the old record. A post-replacement readback
failure is ambiguous: callers must reconcile, not assume rollback or reuse a
possibly consumed refresh token. No power-loss/distributed atomicity is promised.

The adapter rejects nonregular files, reparse points at the record directory and
record/pending/lock entries, and opens entries with `OPEN_REPARSE_POINT` for
handle validation. Local app-data uses the current user's inherited Windows ACLs.
These checks are not protection against an administrator or malicious software
already controlling that user/profile, including concurrent ancestor-path changes.

Failures expose fixed categories only: `too-large`, `corrupt`,
`version-unsupported`, `conflict`, `permission-denied`, `write-failed`, `unavailable`.
DPAPI failures cannot reliably distinguish corrupted ciphertext from unavailable
user keys; neither is reported as a missing/empty record. There is no plaintext,
machine-scope, Credential Manager or new-key fallback. Screen lock does not imply
per-use vault locking or biometric authentication. OS profile/master-key loss
may make records unrecoverable; reauthentication will be necessary. Profile roaming,
domain recovery, OS resets and physical-device migration are not certified.

PR 7 had no production token persistence, so no production credential format is
migrated from Credential Manager. Old synthetic test entries remain untouched;
the adapter does not enumerate/export or silently import legacy entries. Existing
profile/account metadata and Linux/Android aliases are unchanged. A missing new
record does not authenticate a legacy account.

## Real-Windows CI, not emulation

The `native (windows-2022)` job runs the exact production DPAPI source in the
debug-only `storage-smoke` CLI on the hosted **real Windows OS**. The normal Rust
unit test also exercises interrupted replacement against actual DPAPI. Required CI
fails if the Windows job fails; there is no allowed-failure or Wine substitute.

```powershell
cargo run --manifest-path src-tauri/Cargo.toml --locked --features storage-smoke --bin storage-smoke
```

The CLI creates a unique disposable directory and executes every put/get/remove
in a separate process under the same runner user. It tests:

- 1, 960, 961, 1273, 3321, 8530 and 16384-byte new writes, overwrites and readback;
- over-limit/empty rejection with the previous record retained;
- independent accounts, wrong namespace and copied ciphertext rejection;
- damaged, empty, future-version and oversized ciphertext preservation;
- blocked pending-file I/O without false success or old-record deletion;
- an OS-killed writer after pending flush, competitor refusal while it owns the
  lock, subsequent lock recovery and refusal to promote pending ciphertext;
- both initial-write and replacement interruption, arbitrary binary round trips,
  a JSON envelope candidate containing the maximum 8192-byte accepted JWT,
  idempotent removal, and raw/Base64 synthetic plaintext leakage scans.

Only fixed stage/category text is printed. No byte-bearing assertions, tokens,
keys or ciphertext artifacts are uploaded. Cleanup targets only the CLI's own
sandbox. The test feature/config is absent from the subsequent normal native build.
The Windows job checks that native/web normal artifacts exclude named smoke/secret
fixture markers. This marker regression check is not a general-purpose secret scanner.

**Observed real-Windows evidence (2026-11-06):**
[CI run 42270421305](https://github.com/OtavioGonzaga/windwatcher-client/actions/runs/42270421305),
head `5bd8166`, passed frontend, Linux, Windows and required checks. The Windows job
actually ran the DPAPI library test and process fixture, not just compilation:
new/overwrite/readback through 16 KiB, capacity/context/corruption/blocked-I/O
preservation and killed-writer/lock/pending/leak checks all reported success.
The subsequent normal Windows native build also passed. Later fixture extensions
and normal-artifact marker checks require fresh final-HEAD CI; see PR #8 checks.

Local Linux validation also passed `bun run check` (482 tests), 102 existing browser
regressions, audit, locked Rust fmt/check/test/Clippy and the normal native debug build.
The pinned real-server measurement now passes the DPAPI byte budget for all three
grant samples; it still reports the historical provider failures separately.

Local Linux compilation cannot validate this Windows-only module. A passing runner
test establishes only the storage integration under that
runner user/OS: interactive Tauri/WebView2 UX, desktop restart/installation flows,
other Windows versions and real end-to-end session restoration remain untested.
The operator accepted this noninteractive qualification instead of maintaining a VM.
