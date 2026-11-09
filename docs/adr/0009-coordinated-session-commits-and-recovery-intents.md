# 0009: Coordinated session commits and nonsecret recovery intents

- Status: Accepted
- Date: 2026-11-06

## Context

No transaction spans metadata, an OS vault and remote one-use refresh rotation.
PR 7's metadata-only account registration generates its UUID too late for a
secret-first login commit. A JS queue or individual DPAPI record lock cannot
serialize a remote session operation across tabs/processes or recover its outcome.

## Decision

Validate/migrate V1 to a bounded V2 nonsecret document on read, without writing,
renaming storage keys/files, touching credential aliases or resetting corrupt
data. Write V2 on the next successful revision-aware mutation; native IPC rejects
downgrades. Accounts may carry only a nonsecret session/generation/operation
binding. Add one bounded nonsecret intent per account/identity, with explicit
prepared, sent and recovery-required phases; never tokens/passwords/fingerprints.

Use `SessionPersistence` above the shared metadata/secret ports, with a prepared
or reused local UUID. Journal first; put and verify one bound versioned envelope;
commit the exact account UUID and selected account; then clear the intent.
New orphan compensation may remove only an unregistered intent-owned alias.
Failed existing-account replacement never blindly deletes previous credentials.

All metadata writers share a short namespaced state lock. Session operations own
an account lock; fresh account identity resolution also owns a profile/user-pair
lock. Deletion joins the same account coordination and fails on contention rather
than racing or resurrecting an account. Web uses actual Web Locks; without them
the production composition is read-only, not a localStorage mutex approximation.
Native owns OS locks behind three narrow acquire/check/release commands, with
bounded keys/owner count, a single expiry worker and a two-minute lease. Native
writes recheck the owner; expired/released owners cannot overwrite a newer one.
An in-progress native command retains its OS guard until it returns, even if the
renderer's lease expires. Cross-process contention fails closed; same-renderer
explicit waiters serialize. Lease IDs are nonsecret, not credential exports.

Recovery cleans unregistered new-account aliases, confirms a persisted newer
envelope before completing an established account's metadata, or requires login.
A refresh sent marker must be verified durably **before** the POST. Only a
prepared refresh with the confirmed old envelope is provably unsent; sent/unknown
outcomes never authorize replay. Intents older than one day cannot complete an
uncertain established-session commit automatically. If metadata and a verified
envelope already match the exact operation, session and generation, recovery may
clear the completed intent regardless of age without replaying the commit. Terminal evidence remains bounded until fresh
login supersedes it or explicit removal succeeds.

## Consequences

The metadata filename/browser namespace retains `v1` as a storage location, not
the document version. Older clients fail closed on V2; mixed-version in-flight
writers are not supported. Unsupported browser coordination disables writes
instead of silently endangering accounts. A dead renderer cannot retain an idle
native lease indefinitely; a genuinely hung native vault call still requires
process recovery rather than force-unlocking an in-progress write.

Session envelope V1 is one UTF-8 tuple with full account/profile/server-user,
operation/generation and server-session binding. Browser secrecy limitations and
native provider budgets remain unchanged. Tests cover migration, identity/order,
compensation, existing-account replacement and persistent crash snapshots, plus
real native process death/exclusion. This boundary does not itself provide login
UI, refresh scheduling or an authenticated application state.
