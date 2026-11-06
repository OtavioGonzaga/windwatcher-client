# Navigation and responsive shell

Windwatcher has one React root, one declarative React Router HashRouter and the
same shell on web, Linux, Windows and Android. Manual server inspection is public
and in-memory; there are no accounts or persisted settings here.

## Routes and deployment

| Fragment        | Contents                                             |
| --------------- | ---------------------------------------------------- |
| `#/`            | Supplied artwork and truthful product description    |
| `#/preferences` | Working language and appearance controls             |
| `#/connect`     | Manual inspection and Linux-native local suggestions |
| Any other route | Localized not-found message and Home recovery        |

Providers wrap the router, so navigation does not reset appearance/language.
Reload/restart restores browser/system defaults, as documented in the
[visual foundation](visual-foundation.md). Internal navigation uses Link/NavLink,
not full-document navigation. NavLink owns `aria-current="page"`.

Vite emits relative assets (`base: './'`). Serve the normal `dist/` directory
at `/` or any directory prefix, for example `/client/`. Open
`/client/#/preferences`; fragment changes never reach the server. The static
server needs no SPA rewrites. `/client/preferences` is **not** an application
route and may return a server 404. Directory URLs should include a trailing `/`.
Image URLs follow `import.meta.env.BASE_URL`; built CSS/fonts/chunks resolve
relative to their emitted files. CSP is unchanged and permits no remote scripts
or fonts. Tests serve the production output under `/client/` without rewrites.

The Home CTA opens manual inspection. No server is saved and no authentication
is performed. Authenticated routes should be introduced with their real consumers.

## Layout and accessibility

One set of navigation links is reorganized by CSS: a side region at 768px and
wider, or bottom navigation with a compact header below that breakpoint. The
navigation remains in normal flow and scrolls on short viewports rather than
covering fields. Breakpoint changes do not remount page content or clear focus.
There are no fixed-height nested scroll containers or empty messaging panels.

Each route has one H1 inside the shell's only main landmark. The localized skip
link focuses `main-content` without replacing the router's hash. Navigation
targets are at least 44px tall, use existing semantic colors and retain visible
focus/selected boundaries in forced colors. Selection is not conveyed by orange
alone. The document title follows the route and current language.

Focus policy:

- Direct initial load does not steal focus.
- A new route focuses its H1 and starts at the top.
- Back/Forward restores a known entry's scroll and focused element by stable ID,
  falling back to its H1 if the element is absent. The record is bounded to 50
  visited entries and lives only in memory.
- Language/theme/viewport changes do not move focus. No duplicate live route
  announcement is added on top of the heading focus.

While mounted, the shell uses manual browser scroll restoration so native
history restoration does not compete with the route policy. It restores the
previous browser setting on unmount.

Unknown routes render localized recovery. A per-navigation render boundary
displays a generic translated message and a working Home link; exception text
and stack traces are never included in the UI. Synchronous pages have no fake
loading state or unnecessary lazy-route framework.

## Android Back and permissions

Only a Tauri host with an Android user agent loads the Android Back adapter.
The host check is mandatory; an ordinary Android browser does not register a
native listener. The adapter is a separate dynamic chunk, not an eagerly
executed app API in the web/desktop entry. Merely emitting its chunk in the
shared static build is not execution or a desktop capability grant.

The official `@tauri-apps/api/app` API handles hardware/gesture Back. Registration
takes over default Back behavior. A small ephemeral ledger tracks router keys
actually observed by this document, including push/replace/pop and abandoned
forward entries. Neither WebView `canGoBack` nor `history.length` alone proves
there is a safe internal predecessor.

1. Android should dismiss an open IME before delivering route Back.
2. On a secondary route with a known predecessor and native `canGoBack`, navigate
   back exactly once.
3. On direct/unknown secondary history, replace with Home.
4. At Home, `exit(0)` finishes the Activity with the normal system transition.

There are no overlays requiring additional precedence. Events are coalesced
while navigation/exit is pending. Async registration and unregistration are
serialized, including disposal before registration resolves and StrictMode
remounts. Failure to register/exit is shown through a localized notice.

`android-navigation.json` grants only listener registration/removal and Activity
exit, restricted to Android and the local main window. The HTTP capability,
TLS/cleartext policy and production CSP are unchanged. There is no process,
OS-detection, deep-link plugin or custom Rust/Back command.

## Insets and keyboard

PR 3's dark system-bar protection remains noninteractive and hidden from
accessibility. On the tested older WebView, the shell originally extended under
that protection and clipped the header and bottom navigation. The native
content container therefore accounts for system bars and display cutouts, and
zeros **only those handled inset types** before forwarding insets to the WebView.
This is one consistent native strategy, not UA-version-specific padding.
The same native rectangle accounts for IME overlap: the tested M134 otherwise
left its viewport unchanged and hid the focused field. Handled IME dimensions
are zeroed too, preventing duplicate visual-viewport reduction on newer versions;
inset updates continue to propagate and the full object is not consumed.
Web CSS safe-area padding remains useful on browsers and receives zero
for native insets already accounted for, preventing double padding.

WebView behavior depends on version: Android documents fullscreen safe-area
support at M136, visual-viewport IME resize at M139 and all-WebView safe-area
support at M144. Desktop Chromium emulation is not native evidence. Do not add
blur-on-resize handlers or infer keyboard visibility merely from a focused field.

## Tests and native smoke

```bash
bun run check
bun run test:e2e
# Optional shell/IME fixture, never part of normal dist/:
bun run build:shell-test
bun --bun vite preview --outDir dist-shell --port 4177
```

Open `/#/preferences` on port 4177. It mounts the real
shell/providers/pages with a clearly labeled test-only TextField below the fold.
Its data never reaches a server or storage. The production build excludes this
entry and diagnostic markup. The network and foundation fixtures stay separate.

For native keyboard validation, use the repository's normal SDK/ADB setup and:

```bash
CARGO_BUILD_JOBS=4 bun run tauri android build --debug --apk --target x86_64 --ci \
  --config tests/shell/tauri.conf.json -- --locked
```

Install the emitted APK on an x86_64 emulator. Record Android/WebView versions.
Check direct child Back, Home/Preferences history and root exit; use physical
Back/keyevents and gesture mode rather than only JavaScript history. Focus the
fixture field by touch, enter text, inspect field/caret visibility and scrolling,
then check first Back dismisses IME without changing route and the next follows
route policy. Rotate and test 320/360px-equivalent widths, German, both themes,
system night-mode changes, cutouts and bar contrast. Rebuild **without** the
fixture config before treating an APK as the normal application.

Linux must be launched in WebKitGTK and resized wide/narrow/wide. Windows CI
compilation is not interactive WebView2 evidence. Keep native builds/test suites
sequential, at most four Cargo jobs. See [development](development.md) for the
observed validation record and [transport](network-transport.md) for regression
smoke/TLS fixtures. No release or physical-device compatibility is implied.
