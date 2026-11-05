# Architecture

## Implemented baseline

```text
React application (src/app)
          |
       Vite build
          |
        dist/
       /     \
  Browser   Tauri 2 native host
            Linux / Windows / Android
```

There is one React root in `src/main.tsx`. Both browser and native builds use it.
The native Rust library starts a plain Tauri builder; the desktop executable and
Android activity enter the same host. There is no server dependency or embedded
backend. See [ADR 0001](adr/0001-shared-react-and-tauri-application.md).

The current screen displays supplied artwork and the accessible proper name
Windwatcher. It does not implement connection, authentication, conversations,
navigation, themes or localization. Minimal Tailwind colors are not the complete
design system. New feature boundaries should be introduced only when used.

## Tooling boundaries

Bun manages frontend dependencies and runs Vite, TypeScript, Vitest, Playwright
and Oxc tooling. Cargo builds the native host with its own lockfile. Neither Bun
nor a Node server is shipped in native applications; the web output is static.
Platform-specific Java/Kotlin files only host the WebView. Android is not a
second React application.

## Bootstrap security

- There are no custom native commands or plugins. The main window capability
  grants no frontend native permissions.
- Production web output receives a CSP through Vite. Native production CSP is
  configured independently in Tauri; development allows Vite HMR explicitly.
- No remote scripts/fonts, credentials, analytics, storage or network requests
  are introduced. Supplied images are served from the application itself.
- The development server binds loopback unless the Tauri mobile CLI provides a
  device-reachable host. Do not expose it publicly.
- Android currently has the standard Internet permission for its WebView and
  debug development server. The bootstrap does not validate HTTP server transport;
  production cleartext policy/permissions must be deliberately implemented and
  tested with the transport delivery, not assumed from a debug APK.

The CSP is a bootstrap policy, not a completed messaging-client security design.
Network and storage capabilities must be reviewed alongside their actual use.
