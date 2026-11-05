// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");
function tokens(selector: string) {
  const block = css.slice(css.indexOf(selector)).split("}")[0]!;
  return Object.fromEntries(
    Array.from(block.matchAll(/--([\w-]+): (#[\da-f]{6});/g), (match) => [match[1], match[2]]),
  );
}
function luminance(hex: string) {
  const values = [1, 3, 5].map((index) => {
    const value = parseInt(hex.slice(index, index + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return values[0]! * 0.2126 + values[1]! * 0.7152 + values[2]! * 0.0722;
}
function ratio(a: string, b: string) {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

describe.each([":root {", ':root[data-theme="dark"] {'])("semantic AA contrast: %s", (selector) => {
  const palette = tokens(selector);
  const pairs = [
    ...["background", "surface", "subtle-hover"].flatMap((background) =>
      ["foreground", "secondary", "muted", "link", "emphasis"].map((foreground) => [
        foreground,
        background,
      ]),
    ),
    ...["action", "action-hover", "action-pressed"].map((background) => ["on-action", background]),
    ["on-disabled", "disabled"],
    ["foreground", "selection"],
    ...["info", "success", "warning", "danger"].map((tone) => [tone, `${tone}-surface`]),
    ["danger", "background"],
  ];
  it.each(pairs)("%s on %s meets 4.5:1", (foreground, background) => {
    expect(ratio(palette[foreground], palette[background])).toBeGreaterThanOrEqual(4.5);
  });
  it.each(["background", "surface", "subtle-hover"])(
    "focus/border indicators on %s meet 3:1",
    (background) => {
      expect(ratio(palette.focus, palette[background])).toBeGreaterThanOrEqual(3);
      expect(ratio(palette.border, palette[background])).toBeGreaterThanOrEqual(3);
    },
  );
});
