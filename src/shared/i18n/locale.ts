export const locales = ["en", "pt-BR", "es", "de"] as const;
export type Locale = (typeof locales)[number];

export function isLocale(value: string): value is Locale {
  return locales.some((locale) => locale === value);
}

/** Select the first supported language in preference order, not just the first entry. */
export function resolveLocale(languages: readonly string[] = []): Locale {
  for (const language of languages) {
    const base = language.toLowerCase().split("-")[0];
    if (base === "pt") return "pt-BR";
    if (base === "en" || base === "es" || base === "de") return base;
  }
  return "en";
}

export function browserLocale(): Locale {
  return resolveLocale(typeof navigator === "undefined" ? [] : navigator.languages);
}
