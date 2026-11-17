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

## Extension: Group creation (2026-11-16)

Groups reuse this mutation/read ownership boundary without changing Direct
behavior. A Group-specific operation freezes exact title bytes, sorted unique
peer IDs and the confirming context. The session callback rechecks scope and
the conservative 24-hour eligibility window immediately before its sole POST,
after any queued locks or pre-refresh. Backward/invalid clock observations stop
eligibility; an expired key is never silently replaced.

Unlike Directs, a new Group operation can create a duplicate, even with identical
input. Ambiguity remains attached to the attempt across subsequent failures.
Editing after ambiguity requires an explicit risk acknowledgement; a 409 stops
the key and a definitive 422 requires a changed draft and fresh review. Keys
remain intentionally transient through route/account disposal and restart.
No outbox, global form framework or new ADR-level persistence decision is added.

## Extension: non-keyed Group lifecycle (2026-11-17)

Rename, add, role change, remove, transfer and leave reuse the same ownership and
single-dispatch boundary, but the released server does not support idempotency
keys for them. Their page-local immutable intent captures context, Group, source
role/title and requested target/value. There is no same-operation retry action.

Write outcome and read verification are independent: a confirmed HTTP result
survives a failed follow-up GET, while an ambiguous result is not resolved into a
claim of causality by a later matching snapshot. The user can check current
state or explicitly abandon local recovery, then review a new independent action.
Target checks use a fresh bounded traversal (at most ten 50-row pages, with a
30-second read deadline). A partial traversal never establishes target absence.
This is not a multi-page snapshot or transaction; concurrent changes can supersede
any observation.

A fresh two-row membership probe gates sole-Owner destructive confirmation.
The server still decides leave versus transfer-required versus hard deletion at
execution time. A no-access GET cannot prove physical deletion or its cause.
These are concrete Group UI policies, not a durable outbox, background worker,
cross-tab deduplication protocol or new storage architecture.
