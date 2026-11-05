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

Android lazily loads the official app Back API. A session-only ledger of observed
router entries prevents returning to unrelated WebView history. Direct child
entry replaces Home; root Back finishes the Activity using the core exit API.
Only Android receives listener registration/removal and exit permissions through
a separate platform-scoped capability. No process/deep-link/OS plugin is added.

The native Android content container handles bar/cutout/IME overlap and zeros
those inset types before passing updates onward. Installed M134 measurements
showed clipped shell controls and an unchanged viewport behind the IME. This
single native strategy preserves the existing dark bar backing and avoids
double padding/resizing on WebViews which also implement CSS/visual insets.

## Consequences

URLs contain a fragment. Plain nested pathname URLs are not application routes.
Hash URLs do not register OS deep links or require a server/router runtime.
The production bundle and existing isolated fixtures retain separate entries.
