# Local server profiles and account storage

## Identity and scope

Saving a profile is an explicit local action after a successful manual inspection.
Neither typing nor Linux suggestions register a profile. Supported advertisements
must include v1/password; legacy save additionally requires a corroborating legacy
response and acknowledgment. A bare 404 is not enough. All legacy snapshots remain
unverified. No result proves cryptographic server identity or current connectivity.

Home lists saved profiles without network requests. Labels can be renamed; URLs
are immutable. Reinspection opens Add Server with the saved address, waits for an
explicit check, then offers an explicit update of the existing profile. Merely
checking never saves. Forget requires confirmation and warns about local accounts
when present. It does not delete accounts on the remote server.

Local IDs are collision-checked `crypto.randomUUID()` values. Profiles deduplicate
by the existing `ServerUrl.parse` canonical root, not by DNS, advertisements or
remote instance identity. Host aliases, IPv4/IPv6, schemes, nondefault ports and
proxy paths stay distinct. Forget/re-add creates a new ID even at the same address.

Accounts have independent local IDs and a unique `(serverProfileId, serverUserId)`
pair. The pinned API returns UUID user IDs (including UUIDv7); usernames are only
mutable display snapshots. PR 8 must obtain the ID from the authoritative server,
not invent it or substitute the username. There is no production account creation,
login, selection or switching UI. Nullable selected-account metadata establishes
no authenticated context. Registration being closed does not prevent later login.

## V1 document and failure policy

`schema.ts` validates the complete bounded nonsecret V1 document before returning
state and again before every write. Unknown fields, malformed JSON, missing/future
versions, invalid UUIDs/URLs, duplicates, dangling references, unknown selection,
controls and oversized values fail closed. Limits: 100 profiles, 500 accounts,
80-scalar trimmed labels, 128-scalar usernames, 2048-character canonical URLs,
32 capabilities per list with 64-scalar values and a 1 MiB document ceiling.
Snapshots include client inspection/acknowledgment timestamps, not trust proofs.

Missing storage reads as empty V1 without a write. Present corrupt storage never
does. V1-to-V1 is validation, not migration. There was no earlier persisted schema;
future migrations must be explicit sequential transforms with fixture tests and
must reject unsupported starting versions. No speculative migration resets exist.

The repository exposes purpose-specific operations. A single in-process queue
serializes full read/modify/write and credential-cleanup sequences. Each write
increments revision; UI edits include their displayed revision. Failed writes do
not update the UI to success. Reload/retry is explicit on conflicts. Error surfaces
contain only fixed categories, never backend exceptions, request bodies or bytes.

Corrupt data is left in place. Preserve the original document for manual recovery
with a compatible client; there is no automatic reset, truncation, secret export
or diagnostic bundle. Storage denial, full disks/quota and unavailable vaults are
visible failures. Presentation preferences remain memory-only.

## Browser adapters

Nonsecret metadata uses one localStorage key:
`windwatcher-client:<encoded static directory>:v1:state`. For example `/client/`
has a different namespace from `/`. Moving a static deployment changes its
namespace; there is no implicit migration between paths or origins.

Opaque secret records use separate `:secret:<account UUID>` keys and a V1 byte-array
envelope. Only synthetic bytes exercise this adapter in PR 7. **Web secrets are
unencrypted, readable by same-origin JavaScript/XSS, and not OS-vault protected.**
Separate paths on an origin are namespaces, not a security boundary. Browser/private
mode policy can deny storage or discard it on exit. There is no cookie fallback.

Each localStorage item replacement is atomic at the browser API's granularity,
but read/check/write is **not browser-wide compare-and-swap**. The store re-reads
before writing, refuses mismatched documents and invalidates on `storage` events
(including origin-wide clear). Observed changes require reload; simultaneous tabs
can still race before observing events. Do not claim lossless multi-tab merging or
use multiple tabs as independent writers. The repository does not cache a snapshot
for use as an unconditional overwrite.

## Native adapters and permissions

The Rust host owns fixed `client-state-v1.json`, `.pending` and lock paths in the
app data directory. No general filesystem plugin/permissions are added. An OS
file lock protects native compare-and-swap against another process. Writes flush
the pending file before replacement; Unix also flushes its directory. Existing
metadata remains until replacement. A crash can leave a pending file; it is not
automatically promoted. A directory-flush failure after rename is an ambiguous
commit: reload before retrying. Unix directories/files are created as 0700/0600;
Windows uses the current user's app data ACLs. Metadata is not encrypted.

Secrets use the pinned third-party `tauri-plugin-keyring-store` **0.2.0** Rust API
with defaults disabled, not its JavaScript plugin. We do not install its generic
plugin handler or grant default vault/export/procedure permissions. The local main
window receives only five app commands: fixed metadata read/write and account-ID
secret get/put/remove. Secret commands accept canonical local UUIDv4 values and
derive a fixed service plus `windwatcher-client:v1:<account UUID>` alias. No mutable
URL/username or frontend-chosen service/path is used. Opaque records are nonempty
and capped at 16 KiB; native provider limits can be smaller and must surface as
failures. PR 8 must verify actual session-envelope sizes, not truncate tokens.
In particular, the candidate's Windows Base64/UTF-16 password route reduces the
2560-byte Credential Manager blob ceiling to about 960 input bytes. PR 8 must
verify its actual envelope fits or revisit that provider integration before
shipping authentication; splitting rotating fields into separate records is not
an acceptable workaround. PR 7 does not claim full-size session-token support.

Linux uses Secret Service; Windows uses Credential Manager; Android encrypts
SharedPreferences ciphertext with an Android Keystore AES-GCM key. No plaintext
native secret fallback exists. The upstream Android 1.0.0 backend is vendored with
failure-preservation fixes; see its `WINDWATCHER-PATCH.md`. It checks failed commit,
rejects corrupt encoding without logging it, and does not replace lost keys during
a read. Android backup/restore of ciphertext cannot recover a missing Keystore key.
Application backup is explicitly disabled; OEM device-transfer behavior is not
certified. An invalidated/lost key is an unavailable credential, requiring future re-login;
it is never reconstructed from plaintext. Device lock is not a guarantee that
all providers deny access; no biometric/per-use authentication is promised.

Unlock the system vault and retry on `locked`. On `unavailable`, check the user
session/service and restart if necessary: the plugin caches backend initialization
failure for the process. Other provider failures are conservatively unavailable,
not missing entries or authenticated empty sessions. The plugin's `availability()`
and background getters are deliberately unused. JS memory and IPC are not a vault
boundary against compromised local app code; never put record bytes in React,
routes, telemetry, errors or logs. See the [source review](native-secret-storage-review.md).

## Cross-store lifecycle contract for PR 8/9

No transaction spans metadata and the OS vault. Deletion removes each account's
secret first, then commits metadata removal. On any failure all metadata remains
available for cleanup retry, including after partially successful secret deletion.
Retrying remove is idempotent. Selection becomes null if its account is removed;
unrelated account/profile namespaces stay untouched. A metadata-write failure
after secret deletion can leave a record without credentials. PR 8 must treat it
as unauthenticated and request login, never resurrect credentials from metadata.

Future login must write/verify one account-owned versioned credential envelope
before committing account metadata, and attempt cleanup if metadata fails. An
unrecoverable orphan would require an explicitly designed repair marker; PR 7
does not invent one. Future refresh replaces that one envelope, not independent
access/refresh fields. Provider overwrite/durability granularity is not a fully
atomic distributed transaction. Restoration, refresh, logout and active-context
cancellation remain PR 8/9 work.

## Repeatable native smoke

The opt-in `storage-smoke` Cargo feature and `tests/native-storage` frontend are
absent from normal builds. They use a separate metadata subdirectory and service,
synthetic records only, and report stage/category text without secret bytes. Use
a disposable emulator/debug install: it replaces the ordinary app binary.

```bash
# OS backend CLI: a separate process for every operation, Linux/Windows.
CARGO_BUILD_JOBS=4 cargo run --manifest-path src-tauri/Cargo.toml --locked \
  --features storage-smoke --bin storage-smoke
# Actual WebView IPC and metadata restart smoke (three separate launches):
CARGO_BUILD_JOBS=4 bun run tauri build --debug --no-bundle --ci \
  --features storage-smoke --config tests/native-storage/tauri.conf.json -- --locked
# Android: install the emitted APK; force-stop/reopen twice.
CARGO_BUILD_JOBS=4 bun run tauri android build --debug --apk --target x86_64 --ci \
  --features storage-smoke --config tests/native-storage/tauri.conf.json -- --locked
```

First launch writes isolated accounts/records, second verifies exact bytes after
restart and overwrites, third verifies overwritten bytes after restart, namespace
isolation and idempotent deletion, then removes fixture metadata. Inspect nonsecret
app data for plaintext leakage. Repeat failures only in isolated sessions/data,
never by locking an operator's live keyring. Rebuild normal Linux/Android outputs
without feature/config after testing. Windows interactive evidence was explicitly
waived by the operator; CI compilation is not vault runtime certification.
