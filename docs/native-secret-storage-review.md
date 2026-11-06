# Native secret storage: preliminary review

## Status (2026-11-06)

**Blocked; no backend adopted and no credential-storage support implemented.**
The PR 7 plan requires interactive native evidence on Linux, Windows and Android
before adopting a backend and proceeding with dependent storage features. This
checkout cannot supply the required Windows interactive environment. Compilation,
mocked tests or a Linux implementation would not close that gate. Resume the
security spike with access to all three environments, or obtain an explicit
revision of the implementation boundary; do not silently ship a partial adapter.

This is a source-review record, not an accepted ADR, a completed security audit,
or runtime evidence. Profile persistence, account registration and secret adapters
remain unimplemented. The existing in-memory presentation/discovery behavior,
native capabilities, dependencies and server contract are unchanged.

## Reproduced baseline and environment

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

No candidate dependency was added to the app or either lockfile. The review
archive was kept outside the repository.

## Source findings to resolve in the spike

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

None of these findings proves the candidate is unusable or justifies an insecure
fallback. They are unresolved integration and validation requirements.

## Evidence still required before adoption

| Target  | Required evidence still missing                                                                                                                                              |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Linux   | Real WebKitGTK write/read/overwrite/remove, exact-byte read after restart, locked/unavailable service behavior and recovery; KWallet where feasible.                         |
| Windows | Interactive WebView2/Credential Manager isolation, write/read/overwrite/remove, restart and unavailable-store failure. CI compilation is insufficient.                       |
| Android | Installed APK Keystore-backed write/read/overwrite/remove, process death/Activity restart, lock/unlock, key invalidation and backup/restore behavior or precise limitations. |

Use only disposable synthetic records, report booleans rather than secret bytes,
inspect nonsecret app data for plaintext leakage and clean up only test-owned
entries. Do not lock the operator's live keyring to simulate failure; use an
isolated test session. Keep all native builds sequential with at most four Cargo
jobs. No runtime secret tests, native builds, full dependency audit or final-head
CI validation were performed as part of this preliminary review.

Documentation-only validation: `bun run check` passed, including formatting,
lint, TypeScript, API type drift, four emitted target gates, 312 existing tests
and the production build. Browser E2E and native smoke were not run; no runtime
behavior changed.
