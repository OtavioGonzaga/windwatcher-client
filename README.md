# ![Windwatcher](public/brand/windwatcher-banner.png)

The official self-hosted messaging client for the
[Windwatcher protocol](https://github.com/OtavioGonzaga/windwatcher).
One React application targets the web and Tauri 2 on Linux, Windows and Android.

## Status

This repository contains the shared toolchain, a typed HTTP foundation and a
responsive shell, accessible visual tokens, working language/appearance choices,
manual server inspection with optional Linux-native local suggestions, saved
server profiles, registration, sign-in and recoverable sessions. Messaging and
full account switching are **not implemented yet**.
There are no published client releases or supported installation packages.
`0.0.1-dev.0` in build manifests is an unpublished development placeholder, not a release.

The intended server baseline is Windwatcher Server 0.1.1, HTTP API `/v1`.
The client does not embed the Rust server/library or require a central service.
The pinned OpenAPI snapshot and browser/native HTTP adapters are documented in
the [transport guide](docs/network-transport.md). Inspection contacts only the
server the user supplies, except for a bounded Linux-native check of the two
documented loopback defaults. [Local suggestions](docs/local-discovery.md)
require explicit address selection; inspection alone neither authenticates nor
saves a profile. After explicitly saving a server, users can register where
allowed and sign in. See [authentication and sessions](docs/authentication-and-sessions.md)
for credential-storage and platform limitations.

## Development

Install Bun **1.4.4**, the repository's Rust toolchain and the platform
prerequisites in [development](docs/development.md). Then:

```bash
bun install --frozen-lockfile
bun run dev
```

Open `http://127.0.0.1:1420`. For the native desktop application:

```bash
bun run tauri dev
```

Build the static web frontend into `dist/`:

```bash
bun run build
bun run preview
```

Native build and smoke commands, Android setup and verification limitations are
documented in the [development guide](docs/development.md).

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md), the [documentation index](docs/README.md)
and [changelog](CHANGELOG.md). Code and developer documentation are in English;
the [interface foundation](docs/visual-foundation.md) supports `en`, `pt-BR`,
`es` and `de`. Appearance and language choices are not persisted yet.

## License

The software is [MIT licensed](LICENSE); bundled IBM Plex fonts retain their
[SIL OFL license](public/licenses/ibm-plex-OFL.txt). See the [brand asset inventory](public/brand/README.md)
for supplied artwork and outstanding provenance/distribution verification.
