# Changelog

All notable user-facing changes to the Windwatcher client are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Coordinated session storage foundation: explicit V1-to-V2 metadata migration,
  bounded nonsecret recovery intents, exact-ID secret-first verification and
  fenced browser/native operation ownership.
- Saved-server registration and sign-in, verified session restoration and safe
  one-use refresh coordination, with browser-storage and HTTP warnings.
- Explicitly saved, durable server profiles with canonical address deduplication,
  local labels, historical inspection snapshots, reinspection and confirmed forget.
- Validated V1 nonsecret storage and account registry with independent local IDs,
  account-owned browser/OS credential adapters and failure-aware credential cleanup.
  Account switching is not implemented.
- Optional Linux-native loopback server suggestions with identity-first readiness
  checks, explicit address selection and localized dismiss/recheck actions.
- Manual server inspection with HTTP warnings, capability summaries and explicitly
  unverified legacy discovery; inspection alone saves nothing and creates no account.
- Shared responsive navigation between Home and presentation preferences, hash
  URLs supporting static hosting prefixes, accessible focus/skip links and
  localized not-found/render recovery in all four languages.
- Android hardware/gesture Back with direct-entry recovery and Activity finish;
  safe native content bounds for system bars, cutouts and the soft keyboard.
- Accessible warm light/dark/system presentation, locally bundled IBM Plex fonts,
  semantic tokens and focused native-HTML controls with an isolated test fixture.
- English, Brazilian Portuguese, Spanish and German catalogs with working language
  selection, regional fallback, typed keys and locale-aware formatting. Language
  and appearance selections remain in memory until reload/restart.
- Shared React, TypeScript and Tailwind bootstrap screen for web and Tauri 2.
- Minimal Linux/Windows native host and Android host project for the shared frontend.
- Bun-managed tooling, Oxc formatting/linting, component/browser smoke tests,
  incremental CI and development documentation.
- Pinned server 0.1.1 OpenAPI contract, reproducible generated types, validated
  server-bound JSON client and public instance metadata operation.
- Browser and scoped native HTTP transports with explicit bearer credentials,
  redirect refusal, cancellation/deadlines and structured response failures.
- Android HTTP policy shared by debug/release, plus isolated browser/native
  network integration harnesses without adding connection/account UI.
- Incremental response byte budgets, with tighter instance/problem limits and
  explicit per-operation adjustment for legitimate large JSON responses.

### Fixed

- Clear authentication form state when switching server profiles, isolate orphan
  cleanup failures from selected-session restoration, and clear verified completed
  journal entries regardless of age.
- Show only one sign-in link after successful registration.
- Distinguish registration closure and network failures from storage failures in
  localized authentication and restoration messages.
- Replace the undersized Windows Credential Manager integration with one
  current-user DPAPI-protected account record, verified readback and required
  real-Windows CI coverage. Interactive Windows UX remains unqualified.
- Reject oversized Windows credential writes before vault access, with a distinct
  localized capacity error instead of a generic provider failure. Real Server 0.1.1
  grant measurements established the need for the DPAPI replacement above.
- Distinguish saved-server controls by canonical address in accessible names,
  including when display labels repeat, and format inspection dates in the active language.
- Distinguish local-address selection buttons by their exact address in accessible
  names, preserving the short visible labels in all four languages.
- Preserve future instance API/auth advertisements as strings while retaining
  validation of known fields and the unchanged generated v1 DTO contract.
- Validate the success statuses declared by each HTTP operation rather than
  treating arbitrary 2xx JSON responses as completed operations.
- Release native HTTP response resources for no-content statuses through a
  reproducible patch of the pinned plugin wrapper, with regression coverage.
