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
The native Rust library starts Tauri with the scoped HTTP plugin; the desktop
executable and Android activity enter the same host. There is no server dependency or embedded
backend. See [ADR 0001](adr/0001-shared-react-and-tauri-application.md).

The Home route displays supplied artwork and a truthful product description;
Preferences offers real language/appearance controls. Both share responsive
navigation. A Home CTA opens manual server inspection; no server is saved and
there is no authentication or conversation UI. New boundaries
should be introduced only when used.

## Presentation and localization

CSS semantic tokens and Tailwind 4 utilities define light/dark presentation.
The shared theme context resolves system appearance; i18next/react-i18next use
four bundled typed catalogs and a shared browser-locale resolver. Both choices
are in memory only; storage remains deferred. IBM Plex fonts are bundled locally
with OFL notices. No native font/localization plugin or API consumer is added.
Native HTML primitives have isolated component/browser fixtures, not production
routes. See [the visual foundation](visual-foundation.md) and
[ADR 0003](adr/0003-shared-presentation-and-localization.md).

## Navigation and shell

One declarative HashRouter renders Home, Preferences and localized not-found
recovery inside AppShell. Providers remain above page navigation. Relative Vite
assets support arbitrary static directory prefixes without SPA rewrites. A single
navigation region adapts to side/bottom placement using CSS, with route focus,
skip-link and bounded in-memory scroll restoration. Synchronous pages have a
render error boundary, not artificial loading UI.

Android alone lazily loads the official core app Back API. A session-only router
ledger distinguishes known internal history from direct entry. A platform-scoped
capability grants only registration/removal and Activity exit; HTTP scopes and
CSP remain unchanged. The native content rectangle handles bars/cutouts/IME and
zeros those dimensions before forwarding insets, preserving the dark bar backing
without double padding. See [navigation](navigation-shell.md) and
[ADR 0004](adr/0004-hash-navigation-and-static-hosting.md).

## Tooling boundaries

Bun manages frontend dependencies and runs Vite, TypeScript, Vitest, Playwright
and Oxc tooling. Cargo builds the native host with its own lockfile. Neither Bun
nor a Node server is shipped in native applications; the web output is static.
Platform-specific Java/Kotlin files only host the WebView. Android is not a
second React application.

## HTTP foundation

`src/shared/api` owns generated wire types, URL parsing, runtime validation,
structured failures and `ApiClient`. Each client binds an immutable server root
and an injected transport; bearer credentials and request lifetimes are explicit
per-call inputs. The manual discovery feature instantiates an ephemeral client
after user action. `getInstance()` remains strict; a bounded inspection operation
distinguishes explicit absence without weakening generic requests.

`src/shared/platform` supplies browser fetch and lazily loaded Tauri HTTP adapters.
Shared API code imports neither Tauri nor platform detection. The injected host
flag (`isTauri`) selects native transport, not the dev URL, OS/user-agent or CORS errors.
The browser never falls back to a native transport after a failed fetch.

`contracts/` pins the released server 0.1.1 schema and its provenance. Generation
and stale-type detection are offline build-time operations; generated types do
not validate untrusted JSON by themselves. There is no separate SDK package or
generated endpoint service implementation.
Instance advertisements use a derived runtime metadata type with open-ended
string lists, preserving unknown API/auth capabilities without mutating the
pinned generated enum types or deciding onboarding support.
Each operation declares its allowed success statuses. Body consumption has a finite
byte budget before UTF-8/JSON decoding, with tighter instance/problem limits;
see the transport guide for the page-size calculation and configurable-server caveats.

Linux Tauri Add Server additionally performs bounded, identity-first discovery of
the two documented loopback defaults. Advice is page-local, cancels on manual
editing and never saves or authenticates. A build-target literal plus native
identity excludes web/Windows/Android. See [local discovery](local-discovery.md)
and [ADR 0006](adr/0006-linux-local-server-suggestions.md).

No storage or account-adapter scaffolding is introduced. Those boundaries will
be implemented only when their feature consumers exist. See
[HTTP behavior and smoke](network-transport.md), [contract provenance](api-contract.md)
and [ADR 0002](adr/0002-scoped-native-http-and-server-bound-clients.md).

## Network security

- There are no custom native commands. The main window grants the official HTTP
  plugin access to HTTP/HTTPS origins with arbitrary ports/paths, as required for
  user-directed servers. No filesystem/shell or remote-page grants are added.
- The native plugin disables cookie storage, request tracing, unsafe headers and
  dangerous TLS settings. Both adapters refuse redirects; public instance
  requests never inherit a bearer. Request cancellation never retries a write.
- Production web output receives a CSP through Vite. Native production CSP is
  configured independently in Tauri; development allows Vite HMR explicitly.
- No remote scripts/fonts, analytics or credential storage are introduced.
  Supplied images are served from the application itself. Browser CSP permits
  HTTP/HTTPS connections; native CSP stays IPC-only. Native plugin grants do not
  authorize arbitrary remote scripts or replace app-level URL validation.
- The development server binds loopback unless the Tauri mobile CLI provides a
  device-reachable host. Do not expose it publicly.
- Android explicitly permits cleartext in the common main manifest, without a
  debug-only override. Merged debug/release policy and native HTTP are checked
  separately. HTTPS certificate/hostname verification remains mandatory. HTTP
  is not confidential and must be explained by the later connection UX.

This is a transport policy, not a completed messaging-client security design.
Later storage and feature capabilities must be reviewed alongside their use.
