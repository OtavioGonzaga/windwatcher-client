# Development

## Toolchain baseline

| Tool/target             | Baseline                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| Bun                     | 1.4.4, pinned in `.bun-version` and `package.json`                                          |
| Rust                    | 1.99.1, with rustfmt and clippy (`rust-toolchain.toml`)                                     |
| React / Vite / Tailwind | Exact direct versions in `package.json`; `bun.lock` is authoritative                        |
| TypeScript              | Native checker 7.0.2 (`typescript-checker`); generator JS compiler API 5.9.3 (`typescript`) |
| Tauri                   | CLI 2.12.4, Rust host 2.12.5 and build helper 2.7.4, independently pinned                   |
| Linux development       | GTK 3 and WebKitGTK 4.1 development libraries                                               |
| Windows development     | MSVC C++ Build Tools, Windows SDK and WebView2                                              |
| Android                 | Java 21, SDK/target 36, Build Tools 36.0.0, NDK 27.1.12297006                               |
| Android minimum         | API 24 (template baseline, not a tested device-support claim)                               |
| Initial compile targets | Linux/Windows x86_64 and Android ARM64                                                      |

No client release exists. `0.0.1-dev.0` is an unpublished build placeholder;
Tauri requires at least `0.0.1` for Android packaging and rejects `0.0.0`.
The changelog remains `Unreleased`. Do not assign `0.1.0` merely to bootstrap.

Native package installation, signing and a supported distribution matrix are
separate future deliveries. macOS/iOS are not current distribution targets.

## Install dependencies

Install Bun at the pinned version and Rust through rustup. The repository's
toolchain file selects Rust; do not update tool versions implicitly to fix a build.

On Debian/Ubuntu, install Linux prerequisites:

```bash
sudo apt-get update
sudo apt-get install build-essential pkg-config curl wget file \
  libwebkit2gtk-4.1-dev libxdo-dev libssl-dev \
  libayatana-appindicator3-dev librsvg2-dev
```

On Windows, install Microsoft C++ Build Tools with **Desktop development with
C++**, a Windows SDK and the Edge WebView2 Evergreen runtime. Use the MSVC Rust
host (`x86_64-pc-windows-msvc`). This PR compiles an executable, not NSIS or MSI;
do not install MSI tooling on its behalf.

On each platform, from the repository root:

```bash
bun install --frozen-lockfile
```

Bun runs the frontend tools directly. There is no npm/pnpm-managed workflow or
Node application server to deploy. `bun run tauri` invokes the installed CLI
entrypoint explicitly to avoid Bun resolving the identically named package
script recursively.

## Web and desktop

```bash
bun run dev
bun run build
bun run preview
```

Run these separately: `dev` listens on `http://127.0.0.1:1420`; `preview` serves
the production `dist/` on `http://127.0.0.1:4173`. Port conflicts are errors rather
than silently changing the Tauri dev URL. Stop one dev server before starting
`tauri dev`, which starts its own frontend process.

```bash
bun run tauri dev
CARGO_BUILD_JOBS=4 bun run tauri build --debug --no-bundle --ci -- --locked
```

PowerShell users should set `$env:CARGO_BUILD_JOBS = '4'` before the build rather
than copying the POSIX environment assignment. The executables are
`src-tauri/target/debug/windwatcher-client` on Linux and
`src-tauri/target/debug/windwatcher-client.exe` on Windows. A no-bundle build does
not generate installers or imply tested installation support.

The web build currently assumes a root-mounted static host. Base-path routing
and deep links will be decided with navigation; there are no feature routes yet.
The image URL already respects Vite's base URL. Static hosting alone will not
bypass a future server's CORS or browser mixed-content policy.

## Android

Install Android Studio/SDK tools with Java 21, then install these components
using SDK Manager (or `sdkmanager` if command-line tools are available):

```bash
sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0" "ndk;27.1.12297006"
rustup target add aarch64-linux-android
```

Accept the SDK licenses interactively with SDK Manager before building.
On Linux, set paths for your own installation (these examples are not committed
machine-local Gradle properties):

```bash
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
export ANDROID_HOME="$HOME/Android/Sdk"
export NDK_HOME="$ANDROID_HOME/ndk/27.1.12297006"
export PATH="$ANDROID_HOME/platform-tools:$PATH"
```

The Android host in `src-tauri/gen/android` is already initialized and versioned.
Do **not** rerun `android init` during ordinary checkout/build; it may overwrite
reviewed SDK and resource changes or install additional targets unnecessarily.
The Gradle wrapper pins its own version. Build through the CLI, not standalone
Gradle: Tauri generates transient build inputs and coordinates the Rust build.

```bash
CARGO_BUILD_JOBS=4 bun run tauri android build --debug --apk --target aarch64 --ci -- --locked
```

Debug APKs are emitted below `src-tauri/gen/android/app/build/outputs/apk/`.
Select the actual generated APK, then install and open it:

```bash
adb devices
adb install -r path/to/debug.apk
adb shell am start -n io.github.otaviogonzaga.windwatcher.client/.MainActivity
```

Use an ARM64 device/emulator for that APK. An x86_64 emulator requires a separate
Rust target and `--target x86_64`; that is not the initial ARM64 artifact.
Debug signing is local/disposable, not the future release signing process.
There is no push or credential storage. Native HTTP uses the official scoped,
cookie-free plugin; see the [transport guide](network-transport.md).

`bun run tauri android dev` is an optional interactive workflow with a connected
device/emulator. Tauri supplies `TAURI_DEV_HOST` so Vite can bind a reachable
interface and use the matching HMR host. Use a trusted development network only.
The common main manifest explicitly permits cleartext in both debug and release,
not via a debug-only override. See the transport guide for merged-manifest and
installed-adapter evidence; a debug build alone is still not release validation.

## Validation and manual smoke

The [visual foundation](visual-foundation.md) documents theme/locale APIs, font
licenses, contrast tests and the optional component fixture at port 4175.
`test:e2e` builds that fixture separately from production and the network harness;
it checks 320/360/768px/desktop widths, German expansion, keyboard/axe, local
fonts and theme/locale behavior. Theme/language choices are intentionally not
persisted; restart/reload restores system/browser preferences.

See [contribution checks](../CONTRIBUTING.md#validation). Browser tests run against
the production build at desktop and narrow-mobile widths, checking rendering,
artwork, Tailwind output, runtime/CSP errors and horizontal overflow. They do not
replace native WebView or physical-device tests.

The HTTP foundation additionally pins a released OpenAPI snapshot and checks
type drift offline in `bun run check`. `bun run test:e2e` builds a separate
network harness and runs controlled cross-origin fixtures, alongside the static
screen tests. See [contract generation](api-contract.md) and the complete
[native network smoke procedure/evidence](network-transport.md).

For each native launch:

1. Open the compiled application, not just a development browser.
2. Check the window/activity name is **Windwatcher**, with the supplied banner.
3. Resize the desktop window, or rotate the Android device; check for clipping
   and horizontal overflow. Test all four languages and light/dark/system modes.
   No login/message controls should be offered yet.
4. Close and reopen it; check for process crashes or unexpected permission prompts.
5. Record OS, architecture, WebView version and whether this was compile-only,
   emulator or physical-device validation.

The manually dispatched Android workflow uploads an ARM64 **debug** APK for
these checks. It is not a release pipeline. The Windows CI job compiles the MSVC
host but does not automate interactive WebView2 launch. CI workflow definitions
are not evidence of a successful remote run before they have actually run.

### Bootstrap validation record

Local validation was performed on Ubuntu 26.04 x86_64 with Bun 1.4.4, Rust 1.99.1,
Java 21 and WebKitGTK 2.52.6:

- Frontend format/lint/typecheck, two component tests, production build and two
  Chromium production-browser smoke tests passed.
- Rust format/check/clippy and a locked Linux debug no-bundle build passed.
  The compiled Linux host was launched/reopened under X11, its process/window
  identity checked, and its rendered banner visually inspected in a window capture.
- A locked Android ARM64 debug APK build passed. APK metadata confirmed the
  application ID, Windwatcher label, API 24 minimum/API 36 target and ARM64 ABI;
  its debug signature verified with `apksigner`.
- A separate locked x86_64 debug APK was installed and launched/reopened on an
  Android 16 Google APIs emulator (API 36.1 image, emulator 36.4.9). The shared
  React title, loaded banner, Tailwind background and lack of horizontal overflow
  were checked through WebView debugging; portrait/landscape rendering was
  visually inspected. Light system-bar icons were set explicitly for the dark
  bootstrap after this smoke exposed the default low-contrast bars.
- The x86_64 build is emulator evidence, not a promise of an additional supported
  release architecture. The final local APK was rebuilt for ARM64.
- No Windows machine or ARM64 Android device was available. Windows build/launch
  and physical Android coverage remain unverified locally; the Windows CI job
  must actually run before claiming a successful Windows compilation.

The Android build emits upstream Tauri/Gradle warnings about legacy AGP APIs,
Kotlin hooks and Java 8 bytecode targets. They are not suppressed. The template's
compatibility flags are retained for the pinned AGP 9.3.1; do not upgrade to AGP 10
without reviewing the corresponding Tauri template and verifying the build again.

### Visual/localization validation record (2026-11-05)

- Frontend checks passed with 224 unit/component/contract tests (including CSS
  contrast, catalog parity, font notices and immutable artwork checks). The 36
  production-browser/isolated-fixture tests cover local fonts, all four languages,
  system/light/dark, keyboard/axe, forced colors, reduced motion and German at
  320/360/768/1280px with 200% text. Existing network browser tests remain included.
- A compiled Linux x86_64 host on WebKitGTK 2.52.6 was launched and its language
  and appearance controls exercised through native accessibility actions. German
  rendering, focus and light/dark appearance were visually inspected, including
  a resized 320px window. The cream wordmark's loss of contrast on the light
  canvas led to the fixed dark artwork backing, not a modified image.
- A compiled x86_64 debug APK was installed on Android 16/API 36 (Google APIs
  emulator, WebView 134.0.6998.135). WebView inspection confirmed loaded Plex
  faces, all four language changes, document language and empty preference
  storage. At 320/360px-equivalent widths there was no horizontal overflow.
  Native touch selection and keyboard focus worked. System night-mode changes
  updated system appearance. Light/dark screenshots confirmed readable system
  icons after adding fixed native system-bar contrast protection; a scrim alone
  was insufficient under enforced transparent bars on this API.
- Built Linux/Android network harnesses each passed all 12 existing checks,
  including TLS/refused redirects/no-content/cancellation/body limits. Each run
  observed two cancelled requests and zero foreign-origin or invalid-TLS HTTP
  hits. Test harnesses remain outside normal production output.
- Locked normal Linux, Android x86_64 and Android ARM64-target debug builds
  passed; ARM64 compilation does not imply physical-device runtime coverage.
  Android and Linux hosts were closed/reopened successfully after smoke checks.
- Rust fmt/check/clippy and `bun audit` passed. No Windows machine or physical
  ARM64 Android device was available. Fresh remote Windows/Linux/frontend CI is
  still required for this branch; previous PR results are not this PR's evidence.

Screenshots and diagnostic outputs were kept outside the checkout. The native
smoke does not certify release signing, distribution rights, all older Android
versions, Windows interaction or a completed keyboard-safe application shell.

## Troubleshooting

- Missing `gtk+-3.0` or `webkit2gtk-4.1` in pkg-config: install development
  packages, not just runtime libraries. `libxdo-dev` does not expose an `xdo.pc`
  file on Ubuntu; check package installation rather than treating that as failure.
- `JAVA_HOME`/`NDK_HOME` errors: point to the JDK and the pinned NDK directory,
  not the whole SDK or an arbitrary installed NDK version.
- Empty native window: inspect terminal errors and confirm that `dist/` was
  built. Use `tauri dev` for Vite HMR; use a no-bundle build for embedded assets.
- Port 1420/4173 occupied: stop the conflicting process; do not launch duplicate
  servers or change only one side of the frontend/Tauri URL configuration.
- Android dependency-download failures: Gradle and Cargo require network access
  on a cold build. Do not disable certificate checks or switch to untrusted
  repositories to bypass a failure.
