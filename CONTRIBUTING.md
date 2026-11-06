# Contributing

## Requirements and structure

Use Bun 1.4.4 (`.bun-version` and `package.json`) and the Rust toolchain in
`rust-toolchain.toml`. Platform prerequisites and build commands live in
[development](docs/development.md).

- `src/app`: the shared React application and bootstrap styles.
- `src-tauri`: the native shell, capabilities and Android host project.
- `public/brand`: supplied artwork, preserved originals and provenance inventory.
- `tests`: frontend test setup and production-browser smoke tests.
- `docs`: conceptual and development documentation; implemented decisions in ADRs.

Use `bun install --frozen-lockfile` for a clean checkout. Add dependencies with
Bun, pin direct versions and commit `bun.lock`. Commit `src-tauri/Cargo.lock`;
native validation/builds must use `--locked`. Do not add npm/pnpm lockfiles or
an independent frontend for each platform. Bun is a development tool, not an
additional runtime shipped inside Tauri.

## Coding and architecture

- Write code, documentation, tooling messages and metadata in English.
- Use strict TypeScript, Tailwind CSS, Oxlint and Oxfmt. Oxfmt also formats Markdown.
- Prefer Tailwind utilities/shared tokens to component-specific CSS. The CSS
  entrypoint and justified platform/accessibility rules may use CSS directly.
- Do not introduce ESLint/Prettier, suppress warnings without justification or
  weaken types to bypass validation.
- Add small, concrete boundaries when needed, not speculative features/modules.
- Keep native operations out of shared API/UI features. Use the injected network
  boundary. Storage uses only the narrow fixed-document/account-ID commands in
  [the storage contract](docs/storage-and-accounts.md), never generic filesystem,
  shell or credential-export capabilities. Credentials must not enter metadata.
- Do not add server-side administration or UI suggesting unsupported protocol features.
- Introduce localized end-user strings with the four-locale foundation; the
  [visual foundation guide](docs/visual-foundation.md) documents typed keys,
  catalog parity, semantic color pairs and the isolated component fixture.
- Follow the [navigation contract](docs/navigation-shell.md) for routes, focus,
  static-prefix hosting and Android Back/IME. Shell keyboard fixtures are opt-in,
  never production routes. Keep platform capabilities narrowly scoped.

See [architecture](docs/architecture.md). Add an ADR alongside a significant
implemented architectural change, using [the policy](docs/adr/README.md).

## Validation

Run frontend checks sequentially:

```bash
bun run check
bun --bun playwright install chromium
bun run test:e2e
```

`check` runs format checking, lint, TypeScript, unit/component tests and the
production build, plus offline API type drift checking. It never rewrites files.
It also validates emitted web/Linux/Windows/Android local-discovery target gates.
The browser suite includes an isolated local-suggestion fixture; real native
behavior requires the [Linux smoke procedure](docs/local-discovery.md).
Use `bun run api:generate` only when deliberately regenerating pinned-contract
types; see [contract provenance](docs/api-contract.md). The application checker
remains TypeScript 7 (`typescript-checker`); TypeScript 5 provides the generator's
JavaScript compiler API. Use `bun run format` and
`bun run lint:fix` deliberately when making corrections. Editor settings for
VS Code and Zed use Oxc; install the appropriate extensions/language servers and
workspace dependencies rather than assuming globally installed project tools.

Then validate the Rust shell:

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
CARGO_BUILD_JOBS=4 cargo check --manifest-path src-tauri/Cargo.toml --all-targets --locked
CARGO_BUILD_JOBS=4 cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --locked -- -D warnings
```

Run Rust storage validation tests with
`CARGO_BUILD_JOBS=4 cargo test --manifest-path src-tauri/Cargo.toml --lib --locked`.
The [storage smoke procedure](docs/storage-and-accounts.md) is opt-in and separate
from the normal frontend; mock/compile checks are not OS credential evidence.
Run applicable native smoke checks in [development](docs/development.md).
Do not run test suites concurrently; keep heavy native builds sequential with
at most four Cargo jobs. Report unavailable platforms honestly.

## Continuous integration

CI checks the frontend and production-browser smoke tests on Linux, and checks
and compiles the Tauri host on Linux and Windows. The `required` job aggregates
their results. Configure `CI / required` as a protected-branch requirement only
after the workflow exists and passes; repository files cannot configure that
GitHub setting.

A separate manually dispatched workflow builds an Android ARM64 debug APK.
Neither workflow publishes a release, signs a release APK, or produces installers.
See the development guide for the distinction between compile and launch evidence.
The Android workflow additionally compares merged debug/release HTTP policy;
native runtime smoke remains a separate [procedure](docs/network-transport.md).

## Changes and review

Use Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `build:`, `ci:`,
`chore:` and focused optional scopes). Keep changes coherent and reviewable.
Update docs when documented behavior changes. Record notable user-facing changes
under `Unreleased` in the client changelog using Keep a Changelog conventions;
do not invent a release version/date or mirror the server's version.

PRs must explain purpose, changes, validation and limitations. Add relevant tests
for new behavior and regressions; use the PR template. Never commit credentials,
signing keys, machine-specific Android paths or build artifacts. Keep local
planning artifacts ignored by Git.
