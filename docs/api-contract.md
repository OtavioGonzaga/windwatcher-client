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
Canonicalize the exporter output with `JSON.stringify(JSON.parse(text), null, 2)`
plus one final newline into `contracts/windwatcher-v1.openapi.json`. Its SHA-256
is `c83a7136a4e95a4ac2255ce292c17f1988772ebe8e85c29ebdeb73991e3ca1b0`,
also recorded with provenance in `contracts/provenance.json`. This canonical
snapshot is excluded from Oxfmt so formatting cannot silently change its hash.

`bun run api:generate` reads only that snapshot and writes
`src/shared/api/schema.generated.ts`. `bun run api:check` regenerates in memory
and compares bytes without rewriting files; both reject remote references and
checksum/version mismatches. Ordinary client CI must not fetch upstream.

The pinned `openapi-typescript` 7.13.0 requires the TypeScript **5** JavaScript
compiler API, which native TypeScript 7 does not supply. The generation script
resolves that compiler import to the pinned `typescript` 5.9.3 package.
Application checking still explicitly invokes native TypeScript 7.0.2 through
the pinned `typescript-checker` alias; generated output is checked by it. The
explicit script avoids ambiguity between the two packages' `tsc` binaries.
Neither compiler API nor
OpenAPI generator is imported into application runtime bundles. Oxfmt formats
the generated text in memory before comparison, keeping both checks consistent.

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

### Pinned plugin resource-lifecycle patch

Review exposed a bug in the 2.8.3 JavaScript wrapper: `fetch_send` allocates a
native response resource even for a null-body status, but that branch has no
stream to consume/cancel the resource. `patches/@tauri-apps%2Fplugin-http@2.8.3.patch`
adds an awaited call to the existing `dropBody()` for those statuses, in both
ESM and CommonJS builds. Bun applies this small version-bound patch on install;
no custom Rust command, dependency fork or additional permission is introduced.

`native-resource.test.ts` runs the actual plugin wrapper with mocked IPC and
asserts resource release for 204/205/304; it failed before applying the patch.
The native harness also exercises a real 204. Reassess/remove the patch when an
upstream version incorporates the fix, retaining the regression tests.

## Validation constraints

Use controlled local fixtures for cross-origin redirects, cookies, cancellation,
HTTP and invalid certificates. Public HTTPS interoperability is an optional
manual smoke, never an ordinary CI dependency.

Android must use the same explicit cleartext policy for debug and release,
inspect the merged release manifest, and exercise the installed native adapter
with that policy. Debug's former cleartext override is not release evidence.
Windows compilation and interactive execution are separate results.
