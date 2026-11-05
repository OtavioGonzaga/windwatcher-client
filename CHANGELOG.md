# Changelog

All notable user-facing changes to the Windwatcher client are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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

### Fixed

- Validate the exact success status declared by each HTTP operation rather than
  treating arbitrary 2xx JSON responses as completed operations.
- Release native HTTP response resources for no-content statuses through a
  reproducible patch of the pinned plugin wrapper, with regression coverage.
