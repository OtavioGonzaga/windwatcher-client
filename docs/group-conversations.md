# Group creation, membership and lifecycle

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

## Members are independently authoritative

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

## Role-aware management

Group detail includes **Manage group**, scoped to the currently selected account
and server. Direct detail never exposes these controls or performs a Group write.
The summary's last-observed own role controls affordances; the server authorizes
every request again. Owner/Admin can rename, add and manage non-Owner roles.
Only Owner can transfer ownership; ordinary Members can leave but cannot manage.

Rename preserves the exact accepted title and reuses creation's Unicode/256-byte
validation. Save/Cancel is explicit; unchanged titles are valid no-ops without
invented activity. Add uses exact username discovery on the active server and
confirms the canonical identity. A 200 for an existing member preserves the
server's current role and does not imply an invitation or read-state reset.

Loaded non-Owner rows expose Admin/Member promotion/demotion and removal of
another member, with explicit confirmation. Admin self-demotion is allowed and
warns that management access will be lost. The Owner is never patched or removed
through member actions; self-removal uses leave instead. Owner transfer targets
an existing loaded member, including disabled members retained by the server.
The previous Owner becomes Admin. Self-transfer is a successful no-op, not a
claim that ownership moved. Transfer and subsequent leave are separate actions.

## Non-keyed writes and reconciliation

All six lifecycle requests dispatch once under the existing session owner's
profile/account locks, without `Idempotency-Key`. PUT/DELETE member operations
with no body send neither `{}` nor `Content-Type`. HTTP 200/201 responses undergo
strict Group/member decoding and target-ID checking; 204 is an empty response.
Near-expiry pre-refresh remains possible, but 401 never replays the mutation.
Locks serialize participating tabs; they do not deduplicate independently
confirmed actions in different tabs.

Only one Group intent is actionable at a time. Its context, target, role/title and
source observation are immutable. Permission checks, pending reads and cooldown
disable conflicting actions. A new observed own role or target role invalidates
stale review. No raw Problem Details prose, bearer, private watermarks or disabled
status is exposed.

After confirmed writes, the summary is reread and member pagination restarts from
page one. No write DTO is treated as permanent state. A failed follow-up GET does
not erase the confirmed HTTP result; management stays suspended until recovery.
Permission rejection refreshes capabilities without treating readable membership
as gone. `conversation.member_not_found` concerns the target; Group-level
`conversation.not_found` clears all protected detail. Owner protection and
transfer-required errors explain the dedicated transfer path.

Lost responses, timeout, redirect, invalid success DTOs and 5xx enter uncertainty:
**this change may already have happened**. There is no retry button. **Check
current state** performs authoritative reads only. A match means current state
matches the request, not that the previous request definitely caused it. A
difference does not prove it never committed. The user must acknowledge remaining
uncertainty and review a new action, or explicitly abandon local recovery to
Inbox. Leaving, account switching and restart discard the transient state and
cannot undo a remote commit.

Target verification starts a fresh, sequential member traversal, stopping when a
target is found, the traversal ends, ten pages/500 rows have been read, or the
30-second deadline expires. Invalid/repeated cursors fail verification, never
prove absence. A limited traversal reports **unverified**; a matching observation
or exhausted traversal is still not a transaction spanning concurrent mutations.
There is no lifetime member cap, background polling or automatic continuation
beyond the bounded check. Normal list pagination remains user-directed.

## Leave and sole-Owner deletion

Leave begins with a fresh summary. Admins and Members receive an ordinary
access-loss confirmation. For Owner, `GET members?limit=2` must return exactly the
actor's own Owner row, `has_more=false` and no cursor before destructive wording
is available. Partial, malformed or failed evidence cannot enable deletion.
If others remain, transfer ownership to an existing member first.

**Delete group by leaving** explicitly warns that Group, memberships, messages
and reply-linked history are permanently deleted. It sends one
`DELETE /members/me`, never a conversation DELETE. A concurrent addition can
produce `409 conversation.ownership_transfer_required`; refresh and transfer
instead. This preflight is an observation, not an atomic guarantee.

Confirmed 204 clears detail and returns to Inbox. The empty response does not
encode whether execution performed leave or deletion, so the client does not
infer physical deletion from a later 404. An uncertain leave is checked using the
same account; no access is consistent with leave/deletion/removal, not proof of
which event happened. No automatic transfer-plus-leave or repeat DELETE occurs.

There are no message history/composer, realtime, invitations, bulk operations,
read receipts or general server-administration features in this delivery.

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

### Lifecycle verification

API tests live in `group-lifecycle-api.test.ts`; outcome/scan tests in
`group-lifecycle.test.ts` and `useGroupLifecycle.test.ts`; role-aware review and
destructive preflight tests in `GroupManagement.test.tsx`. Session tests cover
all six single-dispatch methods, pre-refresh and sent-refresh cancellation,
including two accounts on one server. Native-adapter header tests mock IPC and
are not native runtime evidence. `groups.spec.ts` extends the existing Group
fixture with real cross-tab contention, dropped responses for all six methods,
permission loss, transfer/self-demotion, deletion races, cooldown, four locales
and 320px keyboard/axe checks.

An opt-in disposable real-server smoke is reproducible with:

```bash
TMPDIR=/tmp/opencode bun scripts/smoke-group-lifecycle.ts /absolute/path/to/pinned/server/source
```

It rejects a dirty/different server revision, builds the pinned source with four
Cargo jobs and `--locked`, migrates a private temporary SQLite database, starts
an ephemeral loopback listener and uses the actual client API/decoders. Credentials
remain in process memory/private sandbox; only stage/result/count evidence is
printed, and the process/database are removed afterwards. Fixture-only SQLite
changes exercise a disabled existing member and seed linked history for direct
physical-deletion checks; they never touch operator data or expose a client
messaging/admin feature. Compilation, this HTTP smoke and interactive native
qualification must be reported separately.

On 2026-11-17 the opt-in smoke passed **44 assertions** against the clean pinned
Server 0.1.1. It exercised Owner/Admin/Member authorization, exact rename and
same-title no-op, new/existing add (including preserved Admin role and disabled
existing member), role changes and Admin self-demotion, Owner protection,
unknown targets, invalid title/role, self-transfer, atomic ownership transfer,
transfer-required leave, normal leave/access loss, Direct protection and real
rename commit with a deliberately discarded response. A separate Owner-only
Group contained two linked fixture messages before leave; direct read-only
SQLite checks confirmed zero Group, membership and message rows afterwards.
Lifecycle requests carried no idempotency key and bodyless requests carried no
JSON body/content-type. This is HTTP/storage evidence, not native UI execution.

Linux locked Rust format/check/Clippy, nine library tests and the debug no-bundle
build passed. Android ARM64 debug APK compilation passed, but ADB had no connected
device. No interactive Group lifecycle smoke in Linux WebKitGTK, Windows
WebView2 or Android/IME is claimed; Windows compilation needs an actual CI run.
