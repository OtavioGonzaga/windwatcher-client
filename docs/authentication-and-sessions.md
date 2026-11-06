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
