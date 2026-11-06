# Linux local server suggestions

Opening Add Server (`/#/connect`) in Linux Tauri starts one optional, page-local
scan. Manual entry stays available immediately. Only these roots are checked:

- `http://127.0.0.1:8080/`
- `http://[::1]:8080/`

These may be different servers; results are displayed separately, without identity
deduplication. Custom binds, ports, proxies and other hosts require manual entry.
An unreachable address does not establish whether a server is installed.

## Platform and network boundary

Vite defines `import.meta.env.NATIVE_TARGET` from the Tauri CLI hook's
`TAURI_ENV_PLATFORM`, defaulting to `web`. Discovery requires **both** the literal
`linux` target and `isTauri()` from the pinned core API. A Linux browser never
scans, even when loading Vite started by Tauri. This is a behavioral guard, not
an authorization boundary; no privileged command trusts this marker.

The scan uses `platformHttp()` and the existing scoped native HTTP adapter. No
new permissions, native commands, OS plugin, CSP, cleartext or plugin-patch changes
are needed. It never reads private configuration, enumerates processes, invokes
a shell, scans the LAN or sends credentials. All requests are unauthenticated GET
with no cookies, bodies or redirects, including same-origin redirects.

The two candidates run independently and concurrently, with no retries/polling.
The entire scan has an eight-second outer deadline. Each complete
`discoverServer()` inspection (including possible legacy corroboration) has a
three-second outer budget; its public manual default remains fifteen seconds.
Readiness gets up to three more seconds, capped by the remaining scan budget.
Results appear individually; a stalled peer does not delay a completed result.
Abort races bound even non-cooperative transport promises. Streams, request
signals, timers and event listeners are disposed at completion/cancellation.

## Identity first, readiness second

The existing manual inspection policy and validators are reused:

1. A structurally valid `/v1/instance` must advertise `service: "windwatcher"`.
   This confirms advertised protocol, not cryptographic ownership.
2. Modern selection requires both `v1` and `password`. Incompatible Windwatcher
   advertisements are shown diagnostically, never offered for selection.
3. Only supported modern advertisements trigger a same-root `/health/ready` GET.
   This unversioned operational route is **not** an `ApiClient.request()` call
   and does not belong in the pinned OpenAPI snapshot.

Readiness requires `application/json` and the exact HTTP/body pairing:

| HTTP                                                                     | JSON status | Meaning/action                                                      |
| ------------------------------------------------------------------------ | ----------- | ------------------------------------------------------------------- |
| 200                                                                      | `ready`     | Ready now; **Use this address** available                           |
| 503                                                                      | `not_ready` | Responding, not ready; diagnostic and **Check again**, no selection |
| Any other pairing, malformed/missing/oversized body, redirect or timeout | —           | Readiness unknown; diagnostic and recheck, no selection             |

The 503 operational JSON is not RFC 9457 Problem Details. Health reads, including
unsuccessful responses, are limited to 4 KiB before JSON parsing. Inspection and
legacy bodies retain the existing 64 KiB metadata budget. `/health/live` is never
queried; liveness, a bare 404 or an open port cannot identify Windwatcher.

After absent instance metadata, only the existing exact legacy
`401 auth.invalid_access_token` clue yields a **possible, unverified** legacy
suggestion. No readiness request is made. Other absence/inconclusive/foreign
responses yield no positive suggestion. Error prose/raw exceptions are not shown.

The compact interface intentionally does not list foreign services, inconclusive
responses or unreachable candidates individually. If none qualify for display,
it says no compatible local server was found; if another candidate qualifies,
only that candidate is shown. This avoids noisy diagnostics or implying anything
about installation/process state. The scanner retains these distinct outcomes,
and manual inspection remains available for an explicitly chosen address.

## Interaction and lifetime

**Use this address** only fills/focuses the existing URL field. It does not inspect,
authenticate or save anything; the user must press **Check server**, and a legacy
result still requires the existing explicit acknowledgment. Plain HTTP remains
plain HTTP, with the existing encryption warning. Manual HTTPS entry is available.

Automatic work has separate state/controllers from manual inspection. Editing
the URL aborts and hides the current advice, preserving user input. Dismissal,
selection, route unmount and replacement scans abort/invalidate old work; late
callbacks cannot restore advice. **Check again** starts a fresh bounded scan,
including after dismissal or editing. There is no global singleton or durable
state. Returning to the route starts a new visit. Completion does not steal focus;
selection focuses the field, dismissal focuses Check again. A polite status region
and all actions are translated into English, Brazilian Portuguese, Spanish and
German.

Selection buttons retain their short visible text but include the exact candidate
root in their localized accessible names, distinguishing IPv4/IPv6 when navigating
a screen reader's control list.

## Validation and repeatable smoke

Run the standard contribution checks. `bun run check:target` additionally builds
the actual platform adapter through the real Vite config for web, Linux, Windows
and Android, then checks the emitted functions with/without native identity.
This is build-marker evidence, **not** Windows/Android runtime certification.

The isolated `bun run build:local-discovery-test` output at
`dist-local-discovery/` uses test-only platform/transport aliases to render the
real page with two ready responses. Playwright serves it on port 4178 for layout,
keyboard and axe checks. It is not native transport evidence and is absent from
ordinary production builds. Production browser tests separately assert no local
discovery region or loopback requests on root/nested routes and mobile Chromium.

For native smoke, use a normal Linux debug no-bundle build, **not** the browser
fixture. First reserve a free candidate port without interrupting an existing
service. Use the released server tag `windwatcher-server-v0.1.1`
(`d83d5d9210ccd35b0c29f03ad678b42644c1d196`), with a temporary explicit config,
SQLite database and JWT key. Initialize/migrate only that disposable server.
Bind IPv4 or IPv6 loopback on 8080, launch the client and open Add Server. Select
the corresponding address, verify field/focus/HTTP warning, then run manual
inspection. Stop/restart the disposable listener; dismiss/retry, navigate away
and return, and reopen the application. Never alter a user's listener to obtain
test evidence.

In a separate run on the same disposable address, use a clearly identified
foreign-service fixture (even with healthy health JSON), then a supported
advertisement with `503 {"status":"not_ready"}`. Verify no foreign suggestion,
no readiness call before compatible identity, and no selection for not-ready.
Do not describe the fixture as a real dependency outage. Keep captures and private
test material outside the repository and stop only processes created for the test.

### Local record (2026-11-06)

- Ubuntu 26.04.1 x86_64, WebKitGTK 2.52.6, Bun 1.4.4, Rust 1.99.1:
  frozen install, `bun run check` (311 tests and four emitted target gates),
  `bun run test:e2e` (88 tests) and `bun audit` passed. The isolated suggestion
  passed German 320/360/768/1280px and 200% text, light/dark, keyboard/focus,
  axe, forced colors and reduced motion checks.
- Rust fmt, locked all-target check/clippy with denied warnings and the normal
  Linux debug no-bundle build passed, with at most four Cargo jobs and sequential
  test/build batches. The compiled app was launched in WebKitGTK, not Chromium.
- A freshly built Linux native network harness passed all twelve transport checks
  via `bun run test:native:report`, with two observed request cancellations and
  zero foreign-origin/invalid-TLS HTTP hits. This used the actual Tauri adapter,
  including rejected self-signed TLS and successful public HTTPS.
- IPv4 8080 was already serving a compatible advertisement; it was left running
  unchanged. Disposable server 0.1.1 on **IPv6** `[::1]:8080` with isolated config,
  SQLite and key produced a separate ready suggestion. Native accessibility
  actions selected IPv6, observed its exact URL in the field and HTTP warning,
  and completed manual inspection with closed-registration metadata.
- After stopping only the disposable IPv6 server, rechecking removed its advice.
  A foreign IPv6 responder yielded no suggestion and received only
  `/v1/instance`, no health request. A separate supported/not-ready fixture
  produced the localized diagnostic without an IPv6 selection action. Dismiss,
  retry, navigation away/back and application reopen were exercised; returning
  started with an empty field. X11 320px rendering was captured/visually inspected.
  Native keyboard text entry was not successfully automated; input-priority,
  stale-result and focus assertions are component/browser evidence, not a claim
  of native keyboard or screen-reader certification.
- `bun run tauri dev --no-watch` also supplied the literal Linux marker and
  displayed native advice. Ordinary Chromium with a Linux user agent at that
  same Tauri-started Vite URL had no advice region and zero loopback requests.
- Locked Android ARM64 debug APK compilation passed with Java 21, SDK 36 and
  NDK 27.1.12297006. Release manifest processing and
  `bun scripts/check-android-network-policy.ts` passed: matching debug/release
  cleartext, no overriding Network Security Config. No Android runtime test or
  physical device certification is claimed. Windows compilation belongs to fresh
  remote CI; interactive WebView2 was unavailable locally.

CI results must be checked on the final PR HEAD; these local records do not claim
remote success. See [transport regressions](network-transport.md) and
[ADR 0006](adr/0006-linux-local-server-suggestions.md).
