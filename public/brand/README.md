# Windwatcher brand assets

Original artwork supplied by the project owner during client preparation.
These files were moved and renamed without changing their bytes.

| File                                       | Original location/name                                                   | Dimensions        |
| ------------------------------------------ | ------------------------------------------------------------------------ | ----------------- |
| `windwatcher-banner.png`                   | `docs/assets/windwatcher-banner.png`                                     | 543 × 181, RGBA   |
| `windwatcher-logo-stacked-dark.png`        | `.agents/artifacts/Logo Windwatcher.png`                                 | 1254 × 1254, RGB  |
| `windwatcher-logo-stacked-transparent.png` | `.agents/artifacts/Imagem do ChatGPT 21 de out. de 2026, 14_33_03-1.png` | 1254 × 1254, RGBA |
| `windwatcher-symbol-transparent.png`       | `.agents/artifacts/Imagem do ChatGPT 21 de out. de 2026, 14_33_05-2.png` | 1254 × 1254, RGBA |

## Original SHA-256 checksums

```text
359603398f0f44011924c184722fa4ddda6a0649be3f415463559760d00856f9  windwatcher-banner.png
abfb816af0fddd859409d8b6bdaa2d64107167272cfce0c2ac05d395e59326f9  windwatcher-logo-stacked-dark.png
f3fd7bebab5e9d75cfb4c86c0ff048076ec117f6d36242b7b4852c26992e1970  windwatcher-logo-stacked-transparent.png
b7c5c52ab85bf791964edfc51fcf6bdfea50ec85ee1c0cb69bd9c25782d73351  windwatcher-symbol-transparent.png
```

## Usage and verification

The visual reference is [Windwatcher Visual Identity v4](https://www.canva.com/d/S8TdlD52QVA930-).
The original filenames alone do not verify a Canva export, creation method or
separate artwork license. Confirm provenance and distribution permissions with
the owner before releasing derived application icons; do not infer them solely
from the repository's software license.

The transparent raster variants have visible edge artifacts. Review them on
light and dark backgrounds and at icon sizes before release use. Preserve these
originals if cleaner exports or platform-specific derivatives are added later.

This directory is the shared source for the frontend. The native bootstrap
uses resized derivatives of `windwatcher-symbol-transparent.png` produced with
the pinned Tauri CLI; see [native icon notes](../../src-tauri/icons/README.md).
These debug/build assets are not a claim that release-icon quality or artwork
distribution verification is complete. No replacement artwork was generated.
