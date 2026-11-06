# Authentication and sessions

## Implementation status

The server-bound HTTP authentication boundary and runtime decoders are implemented.
There is **no production login/registration UI, token persistence, refresh coordinator
or session restoration yet**. The existing profile/account registry does not establish
authentication. Production persistence remains gated by the capacity and cross-store
requirements in [storage and accounts](storage-and-accounts.md).

## Pinned contract

The source is released Server **0.1.1**, commit
`d83d5d9210ccd35b0c29f03ad678b42644c1d196`, not upstream `main`.
The upstream `docs/http-api.md`, `docs/authentication.md`, `docs/sessions.md`,
HTTP error mappings and JWT codec were reviewed at that commit. Wire types derive
from the [pinned snapshot](api-contract.md).

| Operation                                      | Success                              | Authentication         |
| ---------------------------------------------- | ------------------------------------ | ---------------------- |
| `POST /v1/users` with username/password        | 201 user identity, not a session     | Public                 |
| `POST /v1/sessions` with username/password     | 201 session grant                    | Public                 |
| `POST /v1/sessions/refresh` with refresh_token | 200 rotated session grant            | Public                 |
| `GET /v1/users/me`                             | 200 user identity, possibly disabled | Explicit access bearer |

`AuthApi` wraps the existing immutable server-bound `ApiClient`. Lifetimes are
copied explicitly, so an untyped caller cannot inject bearer defaults through
request options. Public methods never inherit authorization. Passwords are sent
exactly as supplied: no trimming, normalization or case folding. These methods do
not automatically retry any request, create local accounts, or select a session.
The existing transports omit cookies and reject redirects; browser failures
never activate the native transport.

Registration does not log in. Login grants contain no user ID; a future coordinator
must obtain it through `/users/me`. Disabled identities must not become ready.
Refresh is one-use CAS rotation, does not extend absolute session expiry, and is
not safely replayable after a timeout, cancellation or lost response. Default
access/session lifetimes (15 minutes/30 days) are configurable, not client constants.

## Runtime validation and limits

TypeScript types do not validate network JSON. The authentication decoders require
complete known fields and reject unknown fields; they return freshly constructed
objects. They check RFC-variant server UUIDs including UUIDv7, UTC RFC3339 dates
with up to nine fractional digits, calendar validity, identity timestamp ordering,
supported `Bearer` scheme and access expiry no later than session expiry.
They do not declare an old grant invalid solely from wall-clock time: expiration,
skew, identity binding and readiness belong to the not-yet-implemented coordinator.

Access tokens are bounded to 8192 ASCII bytes (matching the pinned official JWT
codec) and must have three nonempty base64url-shaped segments. This is syntax
validation, **not** signature/claims verification. Refresh tokens must be canonical
43-character unpadded base64url representing 32 bytes, including zero padding bits.
The client does not decode JWT claims to infer expiry or user identity.

Grant JSON responses are limited to 16 KiB and user/registration JSON to 4 KiB
before UTF-8/JSON decoding. These are transport budgets, not credential-provider
capacity promises. Multibyte-byte overflow is covered by tests. Malformed grants
are never partially returned or persisted.

## Safe failures

`authFailure()` maps fixed semantic categories using stable Problem Details codes
corroborated by status. Exact username/validation codes are `user.username_taken`
(409), `user.invalid_username` and `user.invalid_password` (422). Other dedicated
codes include `auth.invalid_credentials`, `auth.user_disabled`,
`auth.invalid_access_token`, `auth.invalid_refresh_token` and `registration.closed`.
Unknown codes fall back to status categories. `Retry-After` remains safe metadata,
not permission to replay a POST.

The boundary never retains raw server prose or transport exceptions. Network
failure deliberately does not claim to distinguish CORS, mixed content, TLS and
DNS. Future UI must localize these categories rather than render raw exceptions.
Lost registration responses may mean the identity already exists; lost login or
refresh responses may mean remote processing succeeded. A generic transport
failure is never evidence that the server made no change.

## Windows capacity gate

On 2026-11-06, the corrected PR 7 baseline was verified: merged `main`
`9d79fc1ed29a0e7dcf35b78960542783013ab75f` contains corrected head
`ea5e311fb9d74301b2830ca4d5d29d47ea022f88`.

`measureSessionEnvelope()` serializes a compact **candidate**, not a production
format, as this tuple (no passwords):

```text
[1, accountId, profileId, serverUserId, operationId, generation, sessionId,
 tokenType, accessToken, refreshToken, accessExpiresAt, sessionExpiresAt]
```

All IDs are full validated UUIDs; generation uses `Number.MAX_SAFE_INTEGER` in
the real-server gate to include its maximum decimal width. Sizes include actual
server timestamp precision and UTF-8 JSON encoding. The tool never returns or
prints token values; no live grants, keys, configs or databases are committed.
The candidate has no production decoder/migration and is never written to a vault.

The pinned `KeyringStore::set_bytes()` Base64-encodes before calling
`set_password()`. Windows native keyring 1.1.0 converts that ASCII text to UTF-16
and checks against the 2560-byte Credential Manager blob limit. Thus actual blob
bytes are `2 * 4 * ceil(envelopeBytes / 3)`, with an exact input bound of **960
bytes** (961 input bytes require 2568). No NUL terminator is part of that blob.
Tests independently compare this formula with Base64 and UTF-16 encoding.

Observed real Server 0.1.1 results (sizes may vary slightly with timestamp precision):

| Issuer UTF-8 bytes | JWT bytes | Login envelope bytes | Windows encoded blob bytes | Fits current provider |
| ------------------ | --------- | -------------------- | -------------------------- | --------------------- |
| 11 (default)       | 275       | 604                  | 1616                       | Yes, size only        |
| 513                | 944       | 1273                 | 3400                       | **No**                |
| 2049               | 2992      | 3321                 | 8856                       | **No**                |

All three samples successfully registered, logged in, retrieved the authoritative
identity, refreshed once, rejected the consumed refresh token, retrieved the
identity with the new access token, revoked the session and rejected its refresh.
Closed registration was independently confirmed as `403 registration.closed`.
SQLite persistence can shorten timestamp fractional precision on refresh; compare
instants, not raw timestamp string lengths, when checking session expiry.

**Historical Credential Manager gate failed:** even this compact envelope could not fit valid server grants.
The 2049-byte issuer yields a JWT exceeding the raw 2560-byte OS limit itself,
so bypassing Base64 alone is not a complete solution. No truncation, independent
rotating token entries, hardcoded encryption or plaintext fallback is acceptable.
Windows now uses a reviewed, bounded, single [DPAPI record](windows-secret-storage.md)
instead of that route. The byte budget is 16 KiB; required Windows CI must verify
the actual provider against that bound before treating the capacity gate as
qualified. Native size checks reject over-limit writes before provider I/O with
localized `too-large`, preserving previous values. Cross-store coordination and
refresh recovery remain independent gates, not implemented by the provider change.

### Reproduction and evidence limits

```bash
bun scripts/measure-session-capacity.ts /absolute/path/to/clean/pinned/server/source
```

This opt-in tool verifies the pinned source SHA and clean tracked files, builds
that server with `--locked` and four Cargo jobs, and runs processes sequentially
with isolated configuration, random signing keys, temporary SQLite databases and
loopback ephemeral listeners. Inherited Windwatcher configuration overrides are
removed. It consumes only startup diagnostics and prints safe counts/booleans.
It revokes its sessions and removes only its own sandbox afterward.
The output distinguishes `fitsLegacyWindowsProvider` from
`fitsWindowsDpapiByteBudget`: the latter measures input bytes, not successful
DPAPI writes. Exit 0 means all measured envelopes fit the DPAPI byte budget;
exit 2 means that budget failed; exit 1 means no complete measurement was obtained.

This is actual released-server contract/size evidence on Linux, **not Windows
Credential Manager put/overwrite/readback evidence**. This particular server tool
does not exercise Windows. The separate [DPAPI CI](windows-secret-storage.md)
tests the exact production backend on real Windows. No claim is made about full cross-platform persistence,
session restoration, disabled-user or expiry runtime coverage, or crash recovery.
The historical PR 7 Windows waiver is recorded separately and does not resolve
the demonstrated capacity failure.

### Local validation of the gate implementation (2026-11-06)

- `bun install --frozen-lockfile`, `bun run check` (479 tests),
  `bun run test:e2e` (102 existing regression tests) and `bun audit` passed.
- Locked Linux Rust format/check/Clippy and five library tests passed, including
  the platform-independent test of the exact Windows write-size preflight.
- The real-server measurement completed with intentional exit 2, demonstrating
  the unresolved capacity gate, not a successful provider-persistence test.
- No Windows build/runtime, normal native launch, Android APK/Keystore flow or
  final-head GitHub CI has been performed for these changes. Existing E2E tests
  do not exercise new login UI because no such UI is enabled.
