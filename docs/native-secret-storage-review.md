# Native secret storage: source review and runtime evidence

## Status (2026-11-06)

The initial review stopped at the all-platform interactive gate. The operator
then explicitly waived Windows runtime testing and requested completion with
Windows compilation left to GitHub CI. Windows OS-vault behavior is **not**
runtime-certified by this change. Linux/Android evidence below supports the
implemented Rust-only keyring adapter; no plaintext fallback exists.

This is a focused integration review, not an independent security audit. See
[ADR 0007](adr/0007-local-profiles-and-account-owned-secrets.md) and the
[storage contract](storage-and-accounts.md) for the implemented boundaries.

## Initial baseline and environment inventory

- Started a dedicated branch from merged `origin/main` at
  `94e08d1f9e3ea3e9bbcd31bf16d65b1916ed5259`.
- Confirmed the PR 6 address-specific accessible selection names in
  `LocalServerSuggestion.tsx` and all four catalogs.
- Host: Linux x86_64; Rust 1.99.1 and Bun 1.4.4.
- The session D-Bus exposes `org.freedesktop.secrets`, owned by
  `gnome-keyring-daemon`. This establishes service presence only, not successful
  writes, an unlocked collection, persistence or recovery behavior. The user's
  collection was not locked or modified for this review.
- Android SDK/ADB and a configured `Medium_Phone` AVD are present. `adb devices -l`
  returned no attached devices. No emulator was started or APK installed for this
  review; SDK/AVD presence is not Keystore runtime evidence.
- No interactive Windows/WebView2 environment was available to this session.
  Windows Credential Manager behavior remains untested.

## Candidate provenance

Reviewed the published **tauri-plugin-keyring-store 0.2.0** source archive, not
upstream `main`:

- [Published archive](https://static.crates.io/crates/tauri-plugin-keyring-store/tauri-plugin-keyring-store-0.2.0.crate).
- Archive SHA-256:
  `31bcea08aef26f1378f8b82004b434698c203f757e86b21346f7a38f8ae558dc`.
- Packaged `.cargo_vcs_info.json` reports upstream commit
  `11f841f6d7ca1e843c286143102214d46e60e560`.
- Manifest declares `MIT OR Apache-2.0`; both license texts are packaged. This is
  not a completed transitive dependency/license review.
- [Versioned source browser](https://docs.rs/crate/tauri-plugin-keyring-store/0.2.0/source/).

The candidate is now pinned exactly with defaults disabled in the app's Cargo
manifest/lockfile. Its generic plugin is not registered. The review archive was
kept outside the repository.

## Initial source findings

1. `Cargo.toml` enables the wallet-oriented `crypto` feature by default.
   `default-features = false` disables optional `iota-crypto`, but does **not**
   remove all cryptographic/backup dependencies: Argon2, ChaCha20Poly1305 and
   `backup_crypto` remain unconditional. Resolve and review the actual app's
   feature/dependency graph before accepting the dependency.
2. `permissions/default.toml` includes plaintext credential export/import and
   generic vault/procedure commands. Do not grant `keyring-store:default`.
   `lib.rs` registers these handlers through its plugin builder; the public
   Rust `KeyringStore` can instead be evaluated without installing that generic
   plugin IPC surface. A future app boundary must expose only validated
   account-ID-based operations to the local main window.
3. `store.rs` provides `set_bytes`, `get_bytes` and idempotent `delete`. Bytes are
   Base64-encoded before delegating to the OS backend; Base64 is **not** at-rest
   encryption. OS backend behavior, overwrite/crash semantics, size limits and
   isolation still need verification.
4. `KeyringStore::availability()` returns `Available` unconditionally outside
   iOS, including Linux, Windows and Android. It is not evidence that the vault
   is usable. The background getters can conflate locked with missing on iOS;
   use neither behavior as the app's failure contract.
5. `backend.rs` caches initialization failures in a process-wide `OnceLock`.
   A service that becomes available later cannot be assumed to recover through
   another call in that process. Establish a truthful restart/retry policy or
   evaluate the allowed direct native-keyring alternative if this is unsuitable.
6. `error.rs` serializes backend error strings; the app must not forward those
   strings to UI, logs or telemetry. `backend.rs` maps `NoStorageAccess` to locked
   and has Apple-specific message matching, not a demonstrated cross-platform
   locked/unavailable/corrupt classification. Fixed app-owned error categories
   require platform failure tests.
7. `backend.rs` selects Secret Service, Windows native keyring and Android native
   keyring crates by target. Their manifest requirements are major-version
   ranges, not proof of a resolved, audited dependency tree. Android native
   keyring 1.0.0's [source documentation](https://docs.rs/crate/android-native-keyring-store/1.0.0/source/src/lib.rs)
   requires initialized NDK application context. Verify context initialization,
   Activity/process lifecycle, Keystore invalidation and backup/restore in the
   actual Tauri app rather than assuming plugin support is sufficient.

## Implemented dispositions

- The resolved Linux graph includes Secret Service 1.0.1, keyring-core 1.0.1 and
  keyring-store 0.2.0. Android uses native keyring 1.0.0; Windows resolves native
  keyring 1.1.0. The wallet `iota-crypto` feature is absent. Unconditional backup
  crypto dependencies remain linked dependencies, but their procedures and all
  generic import/export IPC are inaccessible through this app's commands.
- Locally downloaded newly added Linux/Android packages declare MIT or
  MIT/Apache-2.0 licenses (inventory compared with the pre-change lockfile).
  Windows native keyring 1.1.0's published `cred.rs`, `store.rs` and utilities
  were inspected separately: service/user-derived targets, native credential
  operations, UTF-16 password encoding and provider size checks, without a file
  fallback. Runtime behavior remains waived, not inferred from that review.
- Only `KeyringStore::{set_bytes,get_bytes,delete}` are used. Neither `init()` nor
  `Builder::build()` installs generic handlers. Local main-window ACL permits only
  the five Windwatcher storage commands, without arbitrary path/service input.
- Fixed error categories replace backend text. `availability()` and the background
  getters are unused. Documentation/UI explain that cached initialization failure
  may require restart; no missing/authenticated session is inferred from errors.
- Android source review found unchecked SharedPreferences commit results, corrupt
  Base64 treated as absence with logging, and lost-key reinitialization on lookup.
  The versioned local patch fixes all three; original source/licenses are retained
  under `src-tauri/vendor/android-native-keyring-store`. Actual Tauri JNI/NDK context
  worked in the installed APK without adding a generic Android crypto plugin.
- Android application backup is explicitly disabled. Ciphertext without its
  Keystore key remains unrecoverable; OEM transfer behavior and physical-device
  key policies are not certified. No key recovery/synchronization is implemented.

## Runtime evidence (2026-11-06)

| Target                                    | Observed evidence and limitations                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Linux x86_64                              | Real GNOME Secret Service CLI write/read/overwrite/remove with each operation in a separate process passed. An absent D-Bus address failed with fixed `unavailable`, not an empty store. A separate `dbus-run-session` with temporary HOME/data/runtime directories created and locked its own test collection: reading a retained synthetic record returned fixed `locked` when the headless unlock prompt could not run. The operator's collection was not locked. Actual built WebKitGTK app ran the three-launch smoke; AT-SPI text confirmed restart read, overwrite, isolation and cleanup. The metadata document was empty after cleanup and mode 0600. KWallet remains unverified.                                                 |
| Android 16 x86_64, WebView 134.0.6998.135 | Installed debug APK ran the same three stages via native IPC, with `am force-stop` between launches. Exact-byte restart read/overwrite, account isolation and idempotent deletion passed. Metadata and encrypted preferences were checked for raw/Base64 synthetic byte leakage without printing those values. A controlled reset cleared this disposable app's data/Keystore, restored only synthetic ciphertext/metadata, then reopened: it failed `unavailable` and retained both metadata accounts and ciphertext entries, rather than regenerating the key or falling back. Test data was cleared afterward. This is emulator evidence, not ARM64 physical hardware, PIN/biometric policy, OEM transfer or full backup certification. |
| Windows                                   | Interactive test waived by the operator. Final-head GitHub CI must compile/check the actual Windows target; it does not establish Credential Manager runtime behavior.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

Use only disposable synthetic records, report booleans rather than secret bytes,
inspect nonsecret app data for plaintext leakage and clean up only test-owned
entries. Do not lock the operator's live keyring to simulate failure; use an
isolated test session. Keep all native builds sequential with at most four Cargo
jobs. These records do not replace final-head CI or an independent audit.

The normal Linux app (without smoke feature/config) also completed the explicit
profile flow through native accessibility actions: choose an existing compatible
loopback suggestion, manually inspect, save, terminate/reopen, observe the saved
profile on Home, then confirm forget of that test-created profile. No remote
mutation or account creation was performed. This is not physical-keyboard or
screen-reader certification.

## Local validation summary

- `bun install --frozen-lockfile`, `bun run check` (355 tests, four emitted target
  gates), `bun run test:e2e` (102 tests) and `bun audit` passed.
- Browser checks include root/nested namespaces, real cross-tab invalidation,
  corruption/denied/quota failure, explicit save/update/rename/confirmed forget,
  keyboard focus and German 320px/200% text. Axe checks full authored light/dark
  palettes. Forced-colors tests check system-adjusted focus/boundaries and other
  axe rules; only axe's authored-color contrast calculation is disabled there
  because it misreads token foregrounds against forced Canvas backgrounds.
- Locked Rust check, fmt, clippy with denied warnings and four library tests
  passed, including the actual Android commit-result decision and native
  replace/reload/conflict/corruption preservation. These tests now run in CI on
  both Linux and Windows; they do not access real vaults in CI.
- Normal Linux debug/no-bundle and Android ARM64 debug APK builds passed without
  the test feature/config. The normal web output and ARM64 library were checked
  for absence of storage-smoke markers. APK inspection showed only `arm64-v8a`
  native libraries, backup disabled and the existing cleartext policy unchanged.
