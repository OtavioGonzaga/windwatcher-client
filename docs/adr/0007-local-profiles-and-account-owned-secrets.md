# 0007: Local profiles and account-owned secrets

- Status: Accepted
- Date: 2026-11-06

The Windows provider decision below is superseded by
[ADR 0008](0008-windows-user-scoped-dpapi-records.md). Other storage boundaries remain in force.

## Context

Several server roots and user identities must survive restart without conflating
URLs or usernames with identity. Actual authentication and account switching are
later deliveries. Credentials cannot be ordinary settings or silently fall back
to plaintext on native platforms.

## Decision

Use collision-checked local UUIDv4 profile/account IDs, canonical URL address
deduplication, immutable profile URLs and server-returned UUID account identities.
Validate one bounded V1 nonsecret document, including references and selection,
before reads/writes. Expose purpose-specific repository operations and serialize
updates. Only manually inspected supported or corroborated/acknowledged legacy
results can be explicitly saved. Legacy is always unverified.

Use separate namespaced browser localStorage metadata and secret adapters with
the explicit same-origin/XSS risk. Detect observed tab conflicts without claiming
atomic browser CAS. Native metadata uses narrow Rust-owned fixed app-data files,
an OS lock, expected-document comparison and flushed replacement; no broad Store
or filesystem capability is warranted for one document.

Native secrets use the Rust API of pinned keyring-store 0.2.0, defaults disabled,
behind account-ID-only app commands. Its generic plugin/permissions are not
installed. Linux Secret Service, Windows Credential Manager and Android Keystore
remain the native providers, with no fallback. Vendor the Android 1.0.0 backend's
commit/corruption/lost-key fixes rather than accepting false persistence success.
See the source review and local runtime evidence for exact scope/limitations.

Delete secrets before committing account/profile removal and keep metadata on
partial failure so cleanup can be retried. No cross-store atomicity is promised.

## Consequences

Unknown/future/corrupt state is preserved, not silently reset. Moving a browser
deployment changes its namespace. Concurrent browser writers can still race;
reload is required for observed conflicts. Unavailable native credentials fail
closed; cached initialization failure can require restart. Lost Android keys do
not trigger replacement or plaintext recovery. The third-party dependency and
Android patch need ongoing review. Windows interactive validation was explicitly
waived by the operator in favor of CI; compilation does not certify vault runtime.
PR 8 must validate real envelope sizes and implement login/restoration/refresh;
PR 9 supplies selection/switching effects. Theme/locale remain memory-only.
