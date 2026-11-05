import { afterEach, describe, expect, it, vi } from "vitest";
import { auditCatalog } from "./catalog";
import { createI18n, resources, selectLanguage } from "./index";
import { browserLocale, locales, resolveLocale } from "./locale";
import { formatDate, formatNumber } from "./format";

describe("locale foundation", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses browser preference order and safely handles missing browser globals", () => {
    vi.stubGlobal("navigator", { languages: ["fr-FR", "es-MX", "en"] });
    expect(browserLocale()).toBe("es");
    vi.stubGlobal("navigator", undefined);
    expect(browserLocale()).toBe("en");
  });
  it.each([
    [["en-GB"], "en"],
    [["pt"], "pt-BR"],
    [["pt-PT"], "pt-BR"],
    [["es-MX"], "es"],
    [["de-AT"], "de"],
    [["fr", "de-DE", "en"], "de"],
    [["fr"], "en"],
    [[], "en"],
    [["PT-br"], "pt-BR"],
  ] as const)("maps %j to %s", (languages, expected) => {
    expect(resolveLocale(languages)).toBe(expected);
  });

  it.each(locales)("has complete catalogs, interpolation and plurals in %s", (locale) => {
    expect(auditCatalog(resources.en, resources[locale])).toEqual([]);
    const instance = createI18n(locale);
    expect(instance.resolvedLanguage).toBe(locale);
    expect(instance.t("greeting", { ns: "foundation", name: "Äna" })).toContain("Äna");
    const singular = instance.t("examples", { ns: "foundation", count: 1 });
    const plural = instance.t("examples", { ns: "foundation", count: 2 });
    expect(singular).toContain("1");
    expect(plural).toContain("2");
    expect(singular.replace("1", "")).not.toBe(plural.replace("2", ""));
    expect(formatNumber(1234.5, locale)).toBe(new Intl.NumberFormat(locale).format(1234.5));
    expect(
      formatDate(new Date("2026-11-05T23:30:00Z"), locale, { dateStyle: "short", timeZone: "UTC" }),
    ).toBe(
      new Intl.DateTimeFormat(locale, { dateStyle: "short", timeZone: "UTC" }).format(
        new Date("2026-11-05T23:30:00Z"),
      ),
    );
    expect(
      formatDate(new Date("2026-11-05T23:30:00Z"), locale, {
        dateStyle: "short",
        timeZone: "Asia/Tokyo",
      }),
    ).not.toBe(
      formatDate(new Date("2026-11-05T23:30:00Z"), locale, { dateStyle: "short", timeZone: "UTC" }),
    );
  });

  it("isolates language changes and resource mutations with English runtime fallback", async () => {
    const first = createI18n("de");
    const second = createI18n("en");
    first.removeResourceBundle("de", "foundation");
    expect(first.t("description", { ns: "foundation" })).toBe(resources.en.foundation.description);
    expect(createI18n("de").t("description", { ns: "foundation" })).toBe(
      resources.de.foundation.description,
    );
    await selectLanguage(first, "es");
    expect(first.resolvedLanguage).toBe("es");
    expect(second.resolvedLanguage).toBe("en");
  });

  it("detects missing keys, empty text, raw keys and changed interpolation/plurals", () => {
    expect(
      auditCatalog(
        { value: "Hello {{name}}", count_one: "one", count_other: "many" },
        { value: "Hallo {{other}}", count_one: "", extra: "extra" },
      ),
    ).toEqual([
      "Interpolation mismatch: value",
      "Missing/empty translation: count_one",
      "Missing/empty translation: count_other",
      "Unexpected key: extra",
    ]);
    expect(auditCatalog({ test: "Example" }, { test: "test" })).toContain("Untranslated key: test");
  });
});
