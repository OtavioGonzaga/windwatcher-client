# Bootstrap native icons

`icon.png`, `icon.ico` and the Android density variants derive from the unchanged
owner-supplied `public/brand/windwatcher-symbol-transparent.png`, SHA-256
`b7c5c52ab85bf791964edfc51fcf6bdfea50ec85ee1c0cb69bd9c25782d73351`.

They were generated with the pinned Tauri CLI:

```bash
bun run tauri icon public/brand/windwatcher-symbol-transparent.png --output src-tauri/icons
```

Only the PNG/ICO and Android output are needed by this bootstrap. Remove the
unused iOS/macOS/Store output from that command rather than committing unsupported
platform packaging assets. The CLI also copies Android resources into the
initialized host; preserve those matching density resources when regenerating.

These are build/debug derivatives, not final reviewed distribution icons. The
adaptive Android icon uses the bootstrap dark background (`#1D2021`) instead
of the generator's white default. Preserve that setting when regenerating.
The
source's raster edge artifacts and provenance checks remain documented in the
[source inventory](../../public/brand/README.md). Do not replace the mark with a
generated lookalike to work around quality issues.
