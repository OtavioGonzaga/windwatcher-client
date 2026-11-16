# 0011: Transient Direct operations and explicit mutation retries

- Status: Accepted
- Date: 2026-11-16

## Context

Server 0.1.1 supports keyed conversation creation for 24 hours. A lost response
does not prove that a mutation failed. The existing authenticated GET coordinator
can refresh and replay a qualifying GET, which would be unsafe as an implicit
policy for writes.

## Decision

The session owner shares bounded profile/account ownership and context fencing
through an internal operation primitive with a required read/mutation policy.
Only reads may replay after a qualifying 401. Direct POSTs pre-refresh if needed
and dispatch once. Existing one-use refresh journal semantics remain unchanged.

A confirmed form owns one random key and immutable participant/payload. Explicit
retry preserves that operation within a conservatively measured 24-hour window.
Keys never enter URLs, logs, metadata or persistent storage. Input/context changes
or route disposal discard the attempt. Conflicts stop it; expiration requires a
new lookup and confirmation.

## Consequences

The UI must explain ambiguous outcomes and cannot promise rollback on cancellation.
Restart does not preserve the original key; a new confirmed operation relies on
the server's unordered Direct uniqueness. Same-server credential operations
serialize under the existing profile gate. No new native permission, persistent
outbox, generic retry middleware or storage schema is introduced.
