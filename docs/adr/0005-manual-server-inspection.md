# 0005: Bounded manual server inspection

- Status: Accepted
- Date: 2026-11-05

## Context

Users need to inspect their chosen server without authenticating or persisting a
profile. Old servers may lack the instance endpoint; arbitrary proxies can also
return a 404, so endpoint absence is not proof of server identity.

## Decision

Run explicit inspection through the existing scoped transport and bounded API
pipeline. Keep strict `getInstance()` unchanged. The discovery-specific path
recognizes 404, 204 and exactly zero delivered bytes on 200 as endpoint absence;
other malformed metadata stays invalid. Structurally valid foreign services are
distinguished before capability policy is applied.

After absence, perform at most one unauthenticated same-root `GET /v1/users/me`.
The pinned 0.1.1 server's `401 auth.invalid_access_token` is only a protocol clue;
404 is unconfirmed and other failures remain failures. The full operation has a
15-second budget. Both legacy cases require acknowledgment before displaying
tentative availability. Registration remains unknown. No result establishes
identity, saves a profile, sends credentials or mutates the server.

## Consequences

Legacy interoperability is not guaranteed by a 404 or an authentication error.
Browser CORS, mixed content and native TLS rules remain unchanged. A future
registration implementation must handle actual `403 registration.closed` after
an attempted registration, rather than infer it from this fallback.
