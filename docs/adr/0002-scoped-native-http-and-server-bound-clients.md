# 0002: Scoped native HTTP and server-bound clients

- Status: Accepted
- Date: 2026-11-05

## Context

Windwatcher connects to arbitrary user-directed HTTP/HTTPS servers, including
reverse-proxy prefixes and custom ports. WebView fetch is not a CORS bypass.
The API uses explicit bearer credentials, not ambient browser or native cookies.
The released server's wire types are not runtime validation of untrusted JSON.

## Decision

Use a small injected `HttpTransport` and immutable server root in `ApiClient`.
Shared API code imports no native APIs. Tokens and cancellation are per request;
`getInstance()` always constructs a public request. Runtime decoders validate
known instance fields, open-ended string capability advertisements and server Problem Details; generic JSON operations
require a decoder, rather than asserting arbitrary JSON as a caller's type.
The runtime instance type derives known fields from generated DTOs but widens
the advertised lists without changing the pinned schema. Capability support
checks are deferred to onboarding, not inferred from structural decoding.

Operations must declare their allowed success statuses; a 202/206 is not accepted
merely because its body passes a decoder. Read delivered bytes incrementally
before UTF-8/JSON decoding, with finite per-operation budgets and tighter
metadata/problem budgets. The generic default accounts for maximum-size default
message pages and full reply text, including JSON escaping; configurable server
policies/history cannot have one universal finite maximum. See the transport
guide for the limits and rationale.

Browser requests use fetch with omitted credentials and manual redirects. Native
requests use the official Tauri HTTP plugin 2.8.3, lazily selected by the same
injected host flag as Tauri's `isTauri()`, with zero redirects. The Rust plugin
disables default features: only Rustls public-root TLS and HTTP/2 are enabled.
Cookies, dangerous TLS settings, unsafe headers and request tracing are absent.
The host exposes no custom HTTP command.

Grant the main window HTTP plugin permissions for `http://*:*/*` and
`https://*:*/*`. These URLPattern scopes include arbitrary ports and paths;
`http:default` without an allow scope would grant no destinations. Do not grant
filesystem, shell or remote-page permissions. Keep the native CSP IPC-only;
browser CSP allows HTTP/HTTPS connections without loosening script/style rules.

Every redirect (including same-origin redirects) is refused, avoiding origin
changes, token forwarding and ambiguous proxy canonicalization. HTTPS
certificate/hostname verification remains mandatory. HTTP is deliberately
supported, not silently upgraded; its lack of confidentiality must be explained
by the later connection UX. Android uses one explicit cleartext manifest policy
for debug and release; this is not permission to disable HTTPS verification.

## Consequences

- A compromised local frontend can reach arbitrary HTTP/HTTPS hosts through the
  plugin, including local networks. This is an explicit product exposure, not a
  server allowlist or an SSRF protection boundary. App-level URL validation still
  rejects credentials, non-HTTP schemes and ambiguous paths.
- Browser CORS, mixed content and TLS remain browser-enforced. A browser failure
  cannot reliably identify which of these failed. CORS does not authorize native
  requests; server authentication and authorization still apply.
- Tokens sent over user-selected HTTP are not confidential. No token store,
  refresh, retry, server registry or discovery policy is introduced here.
- Native TLS uses the plugin's Rustls/WebPKI public roots, not a configurable
  insecure mode or guaranteed support for private enterprise roots.
- Generated DTOs remain a build-time dependency. Future endpoint implementations
  supply their runtime decoders when introduced; no distributable SDK is created.
- Integration harnesses are separate opt-in builds, absent from normal `dist/`.
  Native/WebView execution and release-equivalent Android network policy require
  explicit platform evidence, not merely mock tests or compilation.
