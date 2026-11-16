# Group creation and public membership

## Create on the selected server

From **Inbox**, choose **New group**. Enter a nonblank title of at most 256 UTF-8
**bytes**, not characters. Accepted text is preserved exactly, including surrounding
whitespace and Unicode; no trimming, case folding or normalization is applied.
Blank detection follows Rust's Unicode whitespace semantics, not JavaScript's
different `trim()` set. Unpaired UTF-16 surrogates are rejected before encoding.
These are write limits, not reasons to reject historical longer titles on reads.

Optionally enter a full username and choose **Find and add participant**. Discovery
is exact, authenticated and restricted to the current server; typing does not
query a directory. Missing and disabled peers produce the same no-match result.
Canonical server IDs deduplicate selections; searching yourself reports that you
are already included as Owner. At most 256 distinct additional Members can be
selected, without truncation. Removing a selection is local draft editing only.

Choose **Review group** to confirm the server label/URL, current account as Owner,
exact title and additional Members. An empty selection creates an Owner-only
Group. **Create group** confirms an immutable operation; the creator's ID is not
submitted among the additional participants. The server atomically establishes
the Owner and initial Member memberships. A discovery match is not a guarantee
of eligibility at creation time.

A valid 201 or keyed 200 opens the **server-returned UUID** after context
verification. The detail independently requests its summary and members; the
client never creates an optimistic roster or inbox row from the draft.

## Uncertain creation and duplicate risk

An attempt owns one random key, exact title, sorted distinct peer IDs and confirming
account/profile/user/epoch in page-local memory. Edits are disabled after review
until explicitly returning to the draft, and no concurrent submissions are allowed.
The session owner may pre-refresh but never automatically repeats the Group POST,
including after 401, 429, timeout, 5xx or transport failure.

Lost responses, malformed success bodies, redirects and cancellation after
dispatch cannot prove rollback. **The Group may already exist.** Choose
**Retry same operation** to reuse the identical input and key for less than 24
hours from the operation's creation, conservatively including review/queue time.
Eligibility is checked immediately before network dispatch too. Invalid or
backward clock observations close the window. A 429 disables requests until its
deadline; any earlier uncertainty remains even after a subsequent error.

Groups are **not unique by title**. To edit an uncertain attempt, choose
**Discard uncertain attempt** and separately acknowledge that a new key can create
another Group. Expiration requires a fresh review; conflicts and unavailable
recorded results stop the old key. Definitive title/count/participant rejections
require a changed draft and review. The UI does not identify whether a participant
is disabled or missing, or which peer became unavailable.

Leaving the route, switching accounts or restarting loses the transient key and
cannot cancel remote creation reliably. The page explains this limitation.
Returning to Inbox is nonmutating, but absence from a loaded inbox page does not
prove failure. There is no persistent draft, outbox, background retry or
idempotency-status endpoint.

A replay returns the Group's **current authorized representation**, potentially
renamed and with a different own role. Success is not rejected because it differs
from the initial title or Owner role. It is not a title-based uniqueness lookup.

## Members are independently authoritative and read-only

Only an authoritative Group summary mounts **Members**; Direct detail performs
no membership request. Each page uses `limit=50` and a conversation-bound opaque
next cursor. Rows preserve `joined_at ASC, UserId ASC` server order and display
username, Owner/Admin/Member role and localized join time. A partial page need
not contain the Owner. Roles describe observations, not client authorization.

**Load more** appends unseen IDs, preserving the first occurrence. No total count
or lifetime member cap is inferred; a Group can have more than 100 members.
**Refresh members** aborts continuation, clears rows/cursors and starts page one.
An invalid/repeated cursor or inconsistent response requires a first-page restart.
Ordinary continuation failures retain safely scoped partial rows with explicit
recovery; rate-limited recovery honors `Retry-After`.

Every publication is fenced to the current context and request generation.
Member 403/404 clears both roster and protected parent summary. An empty first
Group page is treated as inconsistent, not silently presented as an empty Group.
Unknown response fields are not retained; other members' read markers, disabled
status, read receipts, presence and profile photos are not displayed or invented.

There are no post-creation add/remove, rename, role change, Owner transfer,
leave/delete or messaging actions in this delivery.

## Verification and evidence

| Coverage  | Automated evidence                                                                                                                                                                                                                       |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G01–G13   | `group-operation.test.ts`, `group-api.test.ts`, `GroupCreationPage.test.tsx`, `groups.spec.ts`: exact titles, Unicode byte boundaries, Owner-only, canonical lookup, owner/dedup, 256/257 selection and server isolation                 |
| G14–G24   | `group-failure.test.ts`, creation component/API timeout tests and E2E: 422/409, ambiguous retry, acknowledged discard, expiry, cooldown, invalid response and non-replay                                                                 |
| G25–G29   | `service.test.ts`, `groups.spec.ts`: pre-refresh, sent-refresh completion, context fences and actual browser cross-tab lock contention                                                                                                   |
| M01–M12   | `group-api.test.ts`, `GroupMembers.test.tsx`, `ConversationPages.test.tsx`, `groups.spec.ts`: roles, strict DTOs, 120-row pagination, overlap, restart, late responses, access loss, discarded private fields and no Direct member fetch |
| UX01–UX04 | Four-locale axe/320px Group review/detail E2E; mocked Android Back fallback; unchanged PR 11 real CORS preflight and native header-adapter regressions                                                                                   |

On 2026-11-16, a clean pinned Server 0.1.1 (`d83d5d9`) was built with `--locked`
and four Cargo jobs and run on an ephemeral loopback port with a private temporary
SQLite database/configuration and generated credentials. A smoke using the actual
client API/decoders passed 15 assertions: Owner-only and populated 201 creation,
semantic same-key 200 with reordered/duplicate/creator IDs, a distinct Group for
the same title with a new key, Owner/Member attribution, next-only pages, exact
256-byte Unicode input and invalid-title/count/participant/cursor/key-conflict
errors. The disposable process/database were removed; operator data was not used.
This is real HTTP contract evidence through Bun fetch, **not interactive client
or native credential-provider evidence**.

The full browser suite covers client orchestration with synthetic server fixtures;
it does not prove every server interruption or native WebView behavior. Linux
Rust checks/tests and debug build and Android ARM64 APK compilation are separate
from runtime qualification. No Android device was attached, and no interactive
Linux WebKitGTK, Windows WebView2 or Android Group/IME smoke is claimed.
