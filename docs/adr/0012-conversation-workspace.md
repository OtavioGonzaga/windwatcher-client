# 0012: Account-scoped responsive conversation workspace

- Status: Accepted
- Date: 2026-11-18

## Context

The initial navigation treated inbox, detail, and settings as separate pages
with the same narrow layout. Visiting a detail unmounted the inbox and lost
loaded pages. The current protocol integration exposes only the latest message,
not a timeline or composer.

## Decision

Make the inbox the verified account's entry point. Nest conversation detail
under the inbox route so the list survives selection changes. CSS renders both
panes on wide screens and shows only the active pane on narrow screens. Direct
hash links still load authoritative detail independently. Known inbox history
restores narrow-screen scroll and focus without fetching the list again.

Keep request ownership and React state scoped to profile, account, and session
epoch. Account changes clear the selected detail in the mounted workspace.
Keep cursor pagination, explicit refresh and the same transport and mutation
policies; introduce no global cache, persistence or native permissions.

## Consequences

Conversation rows and details only represent server-supported data. New Directs
and Groups use separate form routes and leaving the workspace still discards
its list. Setup and account maintenance are separate from daily inbox use.
