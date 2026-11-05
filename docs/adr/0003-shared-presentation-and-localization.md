# 0003: Shared in-memory presentation and bundled localization

- Status: Accepted
- Date: 2026-11-05

## Context

The shared client needs accessible styling and four working languages before
introducing navigation and server onboarding. Browser and native UIs must not
diverge, and storage/account settings have not been implemented.

## Decision

Use CSS custom properties as the single semantic token source, exposed through
Tailwind 4 CSS-first theme utilities. Keep theme selection in a small shared
React context. Resolve system appearance using the standard media query and
apply document semantics from the external application module/provider, without
inline boot scripts or new native privileges.

Use i18next/react-i18next with bundled English, Brazilian Portuguese, Spanish and
German catalogs and typed keys. Inject a fresh initialized i18n instance at the
React root, with a shared deterministic locale resolver and `Intl` helpers.
English is runtime fallback; CI requires catalog parity. There are no remote
translation services, runtime font requests or native localization adapters.

Keep appearance/language selection in memory. Persistence and its schema belong
to the later settings/account-storage delivery. Keep component examples in a
separately built opt-in fixture rather than adding routes or a component-site
framework. Native HTML controls provide the initial accessible primitives.

## Consequences

- All platforms use the same tokens, catalogs, controls and resolution policy.
- Local font binaries, license notices and catalogs increase the static bundle
  but avoid third-party runtime requests and work without network access.
- Tests can isolate i18n instances and exercise system changes without storage.
- Reload/restart resets explicit choices. A cold pre-module document may show
  the static fallback before system appearance is applied; no persisted theme
  boot protocol is implied.
- The presentation foundation is not a router, shell, onboarding form or settings
  store. Those consumers can reuse it without requiring simulated features now.
