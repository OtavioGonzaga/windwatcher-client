# Visual and localization foundation

Windwatcher uses one presentation foundation on web, Linux, Windows and Android.
The production entry screen displays the supplied banner and working appearance
and language controls. It does not connect to a server, render navigation or
simulate accounts, presence, channels or conversations.

## Identity and tokens

The aesthetic reference is **Windwatcher — Visual Identity v4**, Canva design
`DAHZTo2edA8`. Its seven page thumbnails were retrieved using the authenticated
Canva CLI and inspected during implementation. The interface follows its warm
Gruvbox canvas, quiet typography, restrained dividers and meaningful orange
actions. Exploratory channel/presence/chat illustrations are not specifications
of the released server's capabilities.

`src/shared/design-system/tokens.css` is the only color source of truth. Root
custom properties define light and dark semantics; Tailwind 4 `@theme inline`
exposes them as utilities (`bg-background`, `text-foreground`, `border-border`,
`bg-action`, etc.). There is no JavaScript palette or Tailwind v3 configuration.
Brand swatches do not imply accessible semantic pairings.

- Background/surface: light `#FBF1C7` / `#F2E5BC`; dark `#1D2021` / `#282828`.
- Light secondary/muted text derives to `#665C54` instead of reference `#7C6F64`;
  borders derive to `#807366` to retain contrast on raised/hover surfaces.
- Dark borders use `#928374`, not reference `#504945`, for visible controls.
- Orange primary actions use dark text in dark mode; light mode derives the
  orange to `#B34700` with cream text. Hover/pressed pairs are also audited.
- Info, success, warning and danger each have paired foreground/surface colors;
  callers must use both, not arbitrarily mix reference swatches.
- The supplied cream wordmark has a fixed dark `brand-backdrop` in both themes.
  This preserves the original bytes and legibility without filtering/recoloring
  the logo. Artwork quality and redistribution approval remain pre-release gates
  in the [original inventory](../public/brand/README.md).

### Contrast evidence

`contrast.test.ts` reads the CSS itself and applies WCAG relative luminance.
It checks normal-text pairs at **4.5:1**, and relevant boundary/focus pairs at
**3:1**. Minimum ratios across the tested backgrounds/states are:

| Pair group                          | Light | Dark  |
| ----------------------------------- | ----- | ----- |
| Foreground on canvas/surface/hover  | 8.02  | 10.22 |
| Secondary on canvas/surface/hover   | 4.50  | 7.68  |
| Muted on canvas/surface/hover       | 4.50  | 5.32  |
| Action text on normal/hover/pressed | 5.19  | 5.48  |
| Info on paired surface              | 5.94  | 6.96  |
| Success on paired surface           | 6.64  | 7.68  |
| Warning on paired surface           | 6.36  | 8.02  |
| Danger on paired surface            | 5.87  | 7.23  |
| Focus on canvas/surface/hover       | 5.17  | 6.84  |
| Border on canvas/surface/hover      | 3.18  | 3.16  |

The tests additionally cover emphasis, links, disabled text, selection and
field-error text. Rounded display values are not used for threshold decisions.
Disabled states exceed the text threshold even though inactive controls are
exempt; the logo is decorative with an independent accessible product heading.
Browser axe checks cover actual rendered root/fixture content in both themes.
Forced colors use system colors and visible borders, never color alone for
meaning. Focus is a three-pixel outline; reduced motion removes transitions.

### Typography and density

Locally bundled Fontsource **5.3.0** packages provide IBM Plex Sans normal
400/500/600 and IBM Plex Mono normal 400. Only Latin subsets are imported.
The packages record Google Fonts upstream snapshot versions **v23** (Sans) and
**v20** (Mono); upstream type design is [IBM Plex](https://github.com/IBM/plex).
These are package/snapshot identifiers, not invented IBM release numbers.
Fontconfig charset inspection confirmed the accented Latin characters used by
Portuguese, Spanish and German, including `ã`, `ç`, `ñ`, `ü`, `ö`, `ä` and `ß`.
Browser tests check locally loaded faces with representative diacritics.

The distribution includes copyright notices and SIL OFL 1.1 at
`/licenses/ibm-plex-OFL.txt` (relative to the deployed base). Vite copies this
file into both production and test builds. No runtime font CDN is used.
Font weights not actually used must not be added preemptively; technical
metadata uses Mono sparingly, not as the default interface face.

Text sizes are 13/15/16/20px at the default root size, with a 1.55 base line
height. Spacing uses Tailwind's four-pixel scale, controls have a minimum
44px height and icon targets at least 44px. Radii are 4/8/12px. Forms remain
width-constrained, and long text can wrap without hidden overflow. The small
entry composition stacks controls on narrow screens; this is not PR 4's shell.
Motion uses 180ms ease-out only for useful state changes.

## Appearance

`ThemeProvider` exposes `useTheme(): { mode, theme, setMode }`. Mode is
`system | light | dark`, initially system. OS changes update the effective theme
only in system mode. Explicit choices override OS appearance. The provider
removes its media listener on unmount.

`initializeTheme()` runs from the external application module before React
mounts. It sets `data-theme`; CSS defines `color-scheme`. The browser theme-color
meta value is read from the effective CSS background, not duplicated in JS.
There is no inline startup script, unsafe production CSP change, storage or
native preference dependency. The static light fallback may appear before the
external module executes on a cold load; this is not a persisted-theme boot
protocol. A neutral dark native window background remains the pre-WebView fill.

Android keeps light system-bar icons on a fixed dark backing, independent of
the in-memory web theme. API 35+ enforces transparent bars, so a noninteractive,
accessibility-hidden native view paints **only** system-bar insets. It does not
consume touches/insets, resize the WebView or handle IME/back/navigation. This
narrow contrast protection adds no plugin or capability; shell/keyboard-safe
layout and full inset composition remain PR 4 work.

Both appearance and language selections are **in memory only**. Closing or
reloading resets them to system/browser preferences. Persistence is PR 7.

## Components

`src/shared/components` provides native HTML controls. React 19 refs are passed
as ordinary props; native HTML props and keyboard behavior are retained.

- `Button`: explicit primary, secondary and destructive variants; default
  `type="button"`. No invented asynchronous/loading API.
- `IconButton`: requires a translated `label`, hides icon decoration and keeps
  the target size. Lucide icons inherit color and use a 1.75 stroke in the fixture.
- `TextField`: requires a visible label; `useId` provides stable associations.
  Hint/error and external `aria-describedby` IDs compose; errors set
  `aria-invalid`. Errors are not assertive live announcements.
- `InlineNotice`: paired tones and explicit textual meaning. Static guidance
  has no alert role. `announce="polite"` is reserved for an actual update;
  consumers should keep the live region mounted before updating it.
- `PresentationControls`: real native selects, shared by the entry screen and
  fixture. Language names are autonyms with language attributes.

The URL input, reset/clear actions, notices and metadata examples exist only in
the opt-in fixture. They do not validate/connect a server or create production
onboarding. Dialogs, menus, tabs, tooltips and navigation await concrete later
consumers.

## Localization

`src/shared/i18n` uses pinned i18next/react-i18next with local `common` and
`foundation` namespaces. `createI18n()` returns an isolated, synchronously
initialized instance with copied resources; `Providers` receives it explicitly.
Use `useTranslation("namespace")` and typed keys, not concatenation or raw HTML.
React escapes interpolation; `dangerouslySetInnerHTML` is not used.

`Locale` is `en | pt-BR | es | de`. Resolution scans `navigator.languages` in
order and selects the first supported base language: `en-GB → en`,
`pt`/`pt-PT → pt-BR`, `es-MX → es`, `de-AT → de`. Unsupported lists or unavailable
browser globals fall back to English. Native and browser apps use the same
resolver. `selectLanguage(instance, locale)` changes language immediately;
the document language follows the resolved locale without a reload or request.
English is runtime fallback, not a substitute for complete catalogs in CI.

### Adding a string or locale

1. Add a semantic, structured key to the relevant existing namespace in **all
   four** JSON catalogs. Add a namespace only alongside a real consumer.
2. Translate visible labels, accessible names, hints, placeholders and errors.
   `Windwatcher` is a fixed proper noun, including document/window title;
   language-option names are intentionally stable autonyms. Example URLs and
   technical data are not sentences to translate.
3. Use named `{{variables}}`, and i18next `_one`/`_other` forms for current
   supported locales. Do not concatenate sentence fragments. Plural fixtures
   and interpolation are tested in every locale.
4. Run `bun run check`: catalog tests fail on missing/extra keys, empty values,
   raw key names and differing placeholder/plural structures. Strict typed keys
   additionally protect production call sites.
5. Check German expansion at 320px and 200% text size; request linguistic review
   for significant copy changes. No runtime machine-translation service exists.

For a new locale, update `Locale`/resolver, resources, supported-language config,
autonyms in every catalog, plural forms and resolution/formatting tests together.
Catalog ownership follows the feature adding the text, not a remote provider.

`formatNumber(value, locale, options)` and `formatDate(value, locale, options)`
use `Intl`. Pass an explicit `timeZone` for deterministic tests; production
formatting otherwise follows the host time zone. These are formatting helpers,
not message components. Never surface future server ProblemDetails text as a
replacement for a localized, reviewed error message.

## Test build and verification

```bash
bun run check
bun run test:e2e
# Optional manual fixture, after its build:
bun run build:foundation-test
bun --bun vite preview --outDir dist-foundation --port 4175
```

The opt-in fixture is at `/tests/foundation/index.html` on port 4175. It has its
own build entry/output, not an application route or hidden production screen.
Normal `dist/` excludes fixture entry markup/code and PR 2's network diagnostics;
tests assert that separation. Small shared catalogs include fixture strings.
The network harness remains independently opt-in and unchanged in behavior.

Browser coverage includes both themes, system changes, locale switching without
network/storage, keyboard activation/focus, axe, reduced motion, forced colors,
320/360/768/1280px widths, 200% text, local fonts, artwork and CSP. These checks
do not substitute for native rendering or Windows WebView2 interaction.
See the [development guide](development.md) for native commands and evidence.
