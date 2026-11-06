# HTTP transport

## Consumer boundary

Linux-native Add Server also offers a finite scan of two fixed loopback defaults,
using this same transport and manual inspection policy. Its separate bounded
unversioned health reader does not change `ApiClient.request()` or OpenAPI.
See [local discovery](local-discovery.md) for readiness and lifetime details.

Manual discovery explicitly constructs a server-bound
client without introducing global server/account state:

```ts
import { ApiClient } from "../shared/api/client";
import { platformHttp } from "../shared/platform/http";

const client = new ApiClient({
  baseUrl: "https://example.test/windwatcher/",
  transport: await platformHttp(),
});
const controller = new AbortController();
const metadata = await client.getInstance({ signal: controller.signal });
```

The caller owns the controller and client. This is not a server-selection
workflow. The returned instance is validated protocol metadata, not authenticated
server identity or onboarding approval. `inspectInstance()` additionally supports
explicit discovery absence (404, 204 or a genuinely zero-byte 200), without
changing strict `getInstance()`. After absence, one unauthenticated
`GET /v1/users/me` may provide a protocol clue, never proof of identity. Legacy
registration is unknown; acknowledgment is required and no profile is saved.
See [contract provenance and generation](api-contract.md).

`request()` supports GET/POST/PATCH/PUT/DELETE. Declare nonempty
`expectedStatuses: [200]`, `[201]`, or `[200, 201]` with a runtime
`decode(unknown)`, or `expectedStatuses: [204]` with `response: "empty"`.
Only declared successes are accepted. The two-status form represents a created
resource or an existing/idempotent replay without implementing those endpoints.
For example,
`getInstance()` always expects 200 and rejects 201/202/206 as well as 204, without
reading or decoding the unexpected body. An unexpected 2xx is an invalid response, never
an assertion that a server exists. Other endpoint methods/decoders belong with
their consuming features, not a generated service layer.

Only an explicit per-request `accessToken` sets Authorization. `getInstance()`
does not accept or forward it, including extra properties from untyped callers.
Accept is always JSON; Content-Type is set only for a JSON body. GET bodies and
invalid bearer syntax are rejected before network I/O. There is no cookie
authentication, retry, refresh or secret persistence.

## URL policy

- Supply an absolute HTTP/HTTPS root; preserve the scheme, including non-loopback
  HTTP. Normalize default ports/Unicode hosts through WHATWG URL and keep one
  trailing slash. Reverse-proxy prefixes remain before `/v1`.
- IPv4, bracketed IPv6, custom ports and percent-encoded ordinary path segments
  are supported. Endpoint segments and query values are encoded independently.
- Reject userinfo (including empty `@`), query/fragment delimiters even when
  empty, malformed escaping, controls/whitespace, backslashes, duplicate internal
  slashes, dot segments, encoded separators and nested escaping (`%25`). These
  checks run before URL normalization can erase traversal evidence.
- A final decoded `v1` segment is rejected: callers supply the server root or
  proxy prefix, not an API root. There is no silent suffix removal/doubling.
- All redirects are refused, including same-origin redirects. Configure the
  canonical server URL rather than relying on redirect-driven normalization.

## Results and failures

Only `application/json` and `application/problem+json` (with optional parameters)
are accepted. Instance decoding checks service, registration and string-array
advertisements. Compatible extra object fields are ignored. `Instance` derives
the known fields from the generated DTO but deliberately widens `api_versions`
and `auth_methods` to `string[]`, preserving e.g. `v2`/`passkey` without asserting
them as the generated v1 enums. The pinned snapshot/generated DTO are unchanged.
Checking for supported `v1`/`password` capabilities is onboarding policy,
not JSON-shape validation: empty or future-only string lists remain metadata here.

`ApiError.category` is one of `http`, `invalid-response`, `timeout`, `cancelled`,
`transport`, `redirect` or `response-too-large`. Its frozen metadata may include HTTP `status`, problem
`code`, UUID `requestId` and `retryAfterMs`. Native redirects expose HTTP status;
browser opaque redirects do not. Malformed/foreign problems retain available
HTTP metadata but never invent a Windwatcher code. All six required server
Problem Details fields and matching HTTP/body status are validated. Header
correlation IDs take precedence over body IDs when valid.

`Retry-After` accepts nonnegative integer seconds or HTTP-date; elapsed dates
yield zero and invalid values are omitted. This is metadata, not a retry timer.
Server prose, raw bodies/URLs, abort reasons, Authorization and underlying
transport errors are not retained in `ApiError` or logged. Do not introduce
logging of request/response payloads when adding consumers.

The default deadline is 15 seconds, including body consumption. Callers can
supply a positive millisecond duration and/or an AbortSignal. The first abort
cause wins, I/O is aborted, timers/listeners are removed, and late results cannot
run a decoder or update another request context. Cancelling a write does **not**
prove the server did not execute it; there is deliberately no automatic retry.

### Response byte budgets

Bodies are read incrementally, counting delivered bytes before UTF-8 decoding
and JSON parsing. Oversized bodies are cancelled with `response-too-large`,
preserving available HTTP metadata without retaining their content. Malformed
UTF-8 is invalid response data. A declared identity Content-Length can reject
early, but missing/understated/encoded lengths never bypass the stream counter.
Abort/deadline cancellation also cancels a pending reader and releases its lock.

Instance metadata has a fixed **64 KiB** budget; error/problem bodies are limited
to the smaller of **64 KiB** and the operation's budget. Generic JSON requests
default to **160 MiB**, optionally changed by trusted operation code through a
positive `maxResponseBytes`. These are client safety policies, not wire-contract
limits or guarantees about peak process memory (decoded strings/JSON also allocate).

The generic default allows the released server's maximum 100-item page with
default-policy 128 KiB messages **and full shallow reply content**, including
six-byte JSON escapes: `100 × 2 × 131072 × 6 = 150 MiB` before metadata, with
10 MiB headroom. See the pinned source's `docs/pagination.md` and `docs/messages.md`.
Operator-configured larger texts and historical messages have no universal
protocol response maximum. Future message consumers must choose a smaller page
or deliberately sized finite budget for those deployments; no finite default
can cover every configuration. No pagination feature is introduced here.

Browser failures are opaque: CORS, mixed content, certificate validation, DNS and
connectivity are possible causes, not reliably distinguishable categories. The
browser remains authoritative. Native requests are Rust-backed, not WebView
fetch; TLS uses public WebPKI roots and never exposes an insecure override.
See [ADR 0002](adr/0002-scoped-native-http-and-server-bound-clients.md).

## Browser integration checks

`bun run test:e2e` builds a separate `dist-network/` harness, starts local fixture
origins on ports 4318/4319 and serves the production-CSP harness on port 4174.
It exercises allowed/denied CORS, absent ambient cookies and a cross-origin
redirect with an explicit **fixture-only** bearer. Normal `dist/` never contains
the harness or its diagnostic globals. There is no production diagnostic UI.

## Native smoke procedure

Prerequisites: normal native build dependencies, OpenSSL and free ports
4318/4319/4320. Use an isolated fixture process, not a real account/server.
Generate a disposable self-signed fixture certificate **without installing it
as a trusted root**:

```bash
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout /tmp/opencode/windwatcher-test-tls.key \
  -out /tmp/opencode/windwatcher-test-tls.crt \
  -days 1 -subj /CN=127.0.0.1 -addext subjectAltName=IP:127.0.0.1
WINDWATCHER_TEST_TLS_CERT=/tmp/opencode/windwatcher-test-tls.crt \
WINDWATCHER_TEST_TLS_KEY=/tmp/opencode/windwatcher-test-tls.key \
  bun tests/network/fixture-server.ts
```

Keep fixtures running in a separate terminal. Clear a previous report before
each run with `curl -X DELETE http://127.0.0.1:4318/results`.

### Linux and Windows

```bash
CARGO_BUILD_JOBS=4 bun run tauri build --debug --no-bundle --ci \
  --config tests/network/tauri.conf.json -- --locked
./src-tauri/target/debug/windwatcher-client
```

On Windows use PowerShell environment assignments for fixture paths and
`$env:CARGO_BUILD_JOBS = '4'`, then launch the corresponding `.exe`. Choose
temporary paths available on that machine; `/tmp/opencode` is the local Linux
example. The built window runs eleven controlled checks and an optional twelfth
public HTTPS check (`https://example.com/`). Remove `public-https=1` from a local
test config to omit that Internet-dependent check; ordinary CI never depends on it.

In another terminal run `bun run test:native:report`. It requires the actual
Tauri adapter, all controlled checks, TLS fixture enabled, two server-observed
aborted requests and zero foreign-origin or invalid-TLS HTTP hits. The report
contains check names/booleans, not bearer values or raw responses. Close the app
and stop fixtures after checking. Do not mistake an old report for a fresh run.

### Android and production-equivalent HTTP policy

```bash
CARGO_BUILD_JOBS=4 bun run tauri android build --debug --apk --target x86_64 --ci \
  --config tests/network/tauri.conf.json -- --locked
adb reverse tcp:4318 tcp:4318
adb reverse tcp:4319 tcp:4319
adb reverse tcp:4320 tcp:4320
adb install -r src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
adb shell am start -W -n io.github.otaviogonzaga.windwatcher.client/.MainActivity
bun run test:native:report
```

Use `aarch64` instead for an ARM64 device. The main manifest explicitly enables
cleartext; Gradle has **no** debug override. The installed debug APK therefore
uses the release-equivalent cleartext policy. Verify the effective release side
too, after a Tauri Android build has initialized transient Gradle inputs:

```bash
# From src-tauri/gen/android, with JAVA_HOME and ANDROID_HOME set:
./gradlew :app:processUniversalReleaseMainManifest --offline --max-workers=4
# Back at the repository root:
bun scripts/check-android-network-policy.ts
```

Inspect the installed APK's manifest with Android SDK `aapt dump xmltree` as
well: usesCleartextTraffic must be true, with no Network Security Config override.
The manual ARM64 workflow now checks both merged manifests without compiling or
signing a release APK. This is network-policy evidence, **not** release/signing,
installer or API-24-device support validation. On finish remove adb reverse rules
and stop the test emulator. Always rebuild without the harness config before
using an ordinary artifact.

## PR 2 validation evidence (2026-11-05)

- `bun run check`: offline type drift, Oxfmt, Oxlint, native TypeScript 7 checker,
  140 component/unit/contract tests and production build passed. Sixteen production
  Playwright tests passed; `bun audit` reported no vulnerabilities. A deliberate
  stale-generated-file probe failed in check mode without changing the file.
- Locked Rust check/clippy (warnings denied), formatting and the built Linux host
  passed. Cargo's resolved plugin feature graph contains only `http2` and
  `rustls-tls`, not the plugin's cookie/dangerous-settings/tracing features.
- Linux x86_64 built Tauri host and Android 16/API 36.1 x86_64 emulator: all twelve
  native checks passed, including valid public HTTPS and rejected self-signed TLS.
  Each fixture run observed exactly two cancelled requests and zero foreign-origin
  or invalid-TLS HTTP hits. No mock/native-dev-browser substitution was used.
  Follow-up coverage includes refusal of 202, preservation of future capability
  strings and rejection of an oversized chunked instance body.
- Review additionally covered native 204 handling and a reproducible Bun patch
  releasing the pinned plugin's null-body response resources. The three wrapper
  regression tests reproduce the bug without replacing the actual plugin module;
  only its IPC calls are mocked. See [patch rationale](api-contract.md#pinned-plugin-resource-lifecycle-patch).
- Android debug APK's cleartext attribute and both merged debug/release manifests
  were inspected; the common explicit policy matched, without an overriding NSC.
  A release APK itself and ARM64 physical-device runtime were not tested.
- The ordinary Linux debug host and ARM64 debug APK were rebuilt without the
  harness config after smoke testing. The ARM64 APK contains only `arm64-v8a`
  native code; its disposable debug signature verified with Android SDK tools.
- Programmatic `getInstance()` against an isolated real server 0.1.1 built from
  `d83d5d9` passed, with temporary SQLite/config/key files and default closed
  registration. This interoperability check used Bun fetch, not a browser CORS
  test or a claim of direct real-server native execution.
- The PR's frontend, Linux, Windows compile and aggregate CI jobs passed at
  `8d1383c`. Follow-up changes must pass fresh CI before acceptance. Interactive
  Windows runtime is still unverified locally; prior green compilation does not
  replace that manual smoke.
