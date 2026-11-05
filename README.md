# ![Windwatcher](public/brand/windwatcher-banner.png)

The official self-hosted messaging client for the
[Windwatcher protocol](https://github.com/OtavioGonzaga/windwatcher).
One React application targets the web and Tauri 2 on Linux, Windows and Android.

## Status

This repository currently contains the toolchain bootstrap and a static branded
screen. Server connections, accounts and messaging are **not implemented yet**.
There are no published client releases or supported installation packages.
`0.0.1-dev.0` in build manifests is an unpublished development placeholder, not a release.

The intended server baseline is Windwatcher Server 0.1.1, HTTP API `/v1`.
The client does not embed the Rust server/library or require a central service.

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
the upcoming interface foundation will support `en`, `pt-BR`, `es` and `de`.

## License

The software is [MIT licensed](LICENSE). See the [brand asset inventory](public/brand/README.md)
for supplied artwork and outstanding provenance/distribution verification.
