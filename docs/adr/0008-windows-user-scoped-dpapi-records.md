# 0008: Windows user-scoped DPAPI account records

- Status: Accepted
- Date: 2026-11-06

## Context

Real released Server 0.1.1 grants exceed the pinned keyring integration's exact
960-input-byte Windows limit. One valid long-issuer JWT even exceeds Credential
Manager's raw 2560-byte blob capacity. Truncation, separate rotating fields,
hardcoded encryption keys and plaintext fallbacks would violate storage safety.
The operator prefers real hosted Windows CI to maintaining an interactive VM.

## Decision

Replace only the Windows provider from ADR 0007 with one current-user DPAPI
binary ciphertext record per canonical local account UUID. Use the same narrow
account-ID commands and Rust-owned local app-data paths. Bind account/service
context to encryption and validate a versioned bounded inner record after
decryption. Retain a 16 KiB input budget, flush ciphertext-only pending files,
replace with write-through, and verify complete readback before reporting success.
Use short per-account OS file locks, fail closed on contention/corruption/key loss,
and never promote an interrupted pending file automatically.

Require actual DPAPI lifecycle/crash/failure tests across processes on hosted
Windows in the existing required native CI job. Compilation is not runtime
evidence; noninteractive storage evidence is not interactive desktop certification.
No production auth coordinator, login UI, journal or remote-refresh mutex is
introduced by this provider decision.

## Consequences

Linux Secret Service and Android Keystore behavior stay unchanged. Windows gains
capacity for the entire bounded session envelope without splitting credentials
or granting a filesystem/export capability. User-local ciphertext files and
short-lived pending ciphertext need a reviewed lifecycle and inherited user ACLs;
public binding entropy is not a key. DPAPI profile/key loss requires future login,
not fallback or automatic key replacement. Same-user malware/admin compromise,
roaming/recovery and interactive UX are outside this qualification.

PR 7 never stored production tokens, so legacy Credential Manager synthetic
records are not silently migrated or deleted. The cross-store recovery and
remote refresh safety requirements remain mandatory. See the
[provider review and evidence](../windows-secret-storage.md).
