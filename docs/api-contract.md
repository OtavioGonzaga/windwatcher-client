# API contract and transport verification

## Released source

The upstream release is
[`windwatcher-server-v0.1.1`](https://github.com/OtavioGonzaga/windwatcher/releases/tag/windwatcher-server-v0.1.1).
Its annotated tag object is `0d2a4c5db5cb8c376eb300ec7955df909de74270`;
the peeled source commit is `d83d5d9210ccd35b0c29f03ad678b42644c1d196`.
Do not substitute upstream `main` when updating/exporting this contract.

The source's `crates/windwatcher-server/examples/export_openapi.rs` exports the
router's Utoipa document without running a service or loading credentials:

```bash
git checkout --detach d83d5d9210ccd35b0c29f03ad678b42644c1d196
CARGO_BUILD_JOBS=4 cargo run --locked -p windwatcher-server --example export_openapi > openapi.raw.json
```

Run this only in a dedicated upstream checkout, not over someone else's work.
Snapshot canonicalization, checksum and offline client generation are documented
alongside the committed contract. Ordinary client CI must not fetch upstream.

## Native HTTP feasibility review

The official HTTP plugin's stable **2.8.3** JavaScript and Rust sources were
reviewed at upstream tag `http-v2.8.3` in `tauri-apps/plugins-workspace`:

- `plugins/http/guest-js/index.ts`: Rust-backed fetch, `AbortSignal`, streaming
  response cancellation and `maxRedirections: 0`.
- `plugins/http/src/commands.rs`: zero redirects selects `Policy::none()`;
  HTTP/HTTPS scopes checked before I/O; TLS verification is enabled by default.
- `plugins/http/src/scope.rs`: URLPattern scopes, not shell globs. Use explicit
  HTTP and HTTPS patterns with wildcard ports for arbitrary user-directed servers.
- `plugins/http/Cargo.toml`: Linux, Windows and Android supported. Default
  features include **cookies**; disable defaults and enable only Rustls TLS and
  HTTP/2. Do not enable `cookies`, `dangerous-settings`, `unsafe-headers` or
  request tracing. `credentials: "omit"` alone does not disable the native jar.

These are source/API feasibility findings, **not runtime validation evidence**.
No custom Rust HTTP command is warranted unless integration exposes a concrete
blocking limitation. Native imports belong exclusively in the platform adapter.

## Validation constraints

Use controlled local fixtures for cross-origin redirects, cookies, cancellation,
HTTP and invalid certificates. Public HTTPS interoperability is an optional
manual smoke, never an ordinary CI dependency.

Android must use the same explicit cleartext policy for debug and release,
inspect the merged release manifest, and exercise the installed native adapter
with that policy. Debug's former cleartext override is not release evidence.
Windows compilation and interactive execution are separate results.
