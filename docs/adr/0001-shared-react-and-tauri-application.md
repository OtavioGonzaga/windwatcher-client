# 0001: Shared React application and Tauri host

- Status: Accepted
- Date: 2026-11-05

## Context

Windwatcher needs a web, Linux, Windows and Android client without duplicating
functional screens or embedding the Windwatcher server. The first delivery must
prove the toolchain with a minimal, honest application before adding workflows.

## Decision

Use one React/strict TypeScript application built by Vite, with Tailwind CSS
and Bun-managed dependencies/scripts. Tauri 2 consumes that same `dist/` output
and hosts it in the platform WebView. Its Rust library entrypoint supports
desktop and Android; the desktop executable delegates to it. The generated
Android host is versioned because its SDK settings and application identity are
part of the build, while local paths/caches/generated build inputs remain ignored.

The native host exposes no custom commands, plugins or frontend native
permissions. Platform ports will be introduced only with concrete consumers.
Keep native dependencies inside `src-tauri`; do not embed the server crate or
create a separate SDK, workspace or frontend per platform.

The display name is Windwatcher. Internal package/application identity includes
`client`, with bundle ID `io.github.otaviogonzaga.windwatcher.client`.
Manifest version `0.0.1-dev.0` is an unpublished technical placeholder (Tauri
rejects `0.0.0` for Android builds). Changelog
entries accumulate under `Unreleased` until an independent client release.

## Consequences

- Web and native builds share application code and tests, but native behavior
  still requires platform smoke checks: Chromium cannot stand in for WebKitGTK,
  WebView2 or Android WebView.
- Native system toolchains are development/build requirements; Bun is not
  distributed as an application runtime.
- Tailwind is initialized with bootstrap colors only. The full visual system,
  localization and responsive navigation remain separate deliveries.
- This decision does not select network, credential-storage, routing or
  notification adapters. The static screen makes no API calls.
- Installer packaging, signing and supported distribution architectures are not
  established by successful bootstrap compilation.
