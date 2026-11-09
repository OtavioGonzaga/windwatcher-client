# 0010: Profile gates and local-first session cleanup

- Status: Accepted
- Date: 2026-11-09

## Context

Account cleanup previously acquired account ownership inside a state mutation,
opposite to authentication's account-before-state ordering. Forgetting a server
must also exclude fresh identities and pending intents. Acquiring every account
owner simultaneously cannot support the document's 500 accounts with the native
64-owner limit and two-minute leases.

## Decision

Credential operations acquire a narrow `profile-<local UUID>` gate before identity
(when needed), account and short state ownership. Server forgetting holds that
gate, deletes and verifies affected aliases sequentially under individual account
owners, then commits metadata against the original revision. All metadata remains
on partial failure. The gate uses the existing scoped acquire/check/release IPC;
it adds no filesystem or secret-export authority. Profile URLs remain immutable.

## Consequences

Credential work on the same server serializes, including otherwise independent
accounts; different servers remain independent. Bulk cleanup holds at most three
owners rather than one per account. Expiration or contention fails closed with a
retryable conflict, not a promise of cross-store atomicity. A failed partial delete
can leave saved accounts without credentials; retry or reauthentication is explicit.
All supported writers must use this ordering; older concurrent clients that do not
participate in the profile gate are unsupported.
