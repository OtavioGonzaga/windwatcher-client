# 0004: Hash navigation and portable static hosting

- Status: Accepted
- Date: 2026-11-05

## Context

The same static bundle runs on arbitrary web prefixes and Tauri asset origins.
The first navigable pages are Home and in-memory presentation preferences.

## Decision

Use React Router in declarative mode with one HashRouter and synchronous routes.
Keep presentation providers outside the router's page tree. Build with relative
Vite assets so hash entry/reload works under a static directory without rewrites.
Unknown routes render localized recovery. Do not register future product routes.

## Consequences

URLs contain a fragment. Plain nested pathname URLs are not application routes.
Hash URLs do not register OS deep links or require a server/router runtime.
The production bundle and existing isolated fixtures retain separate entries.
