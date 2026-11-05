import { createInstance } from "i18next";
import type { i18n } from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import ptBR from "./locales/pt-BR.json";
import es from "./locales/es.json";
import de from "./locales/de.json";
import { browserLocale, locales } from "./locale";
import type { Locale } from "./locale";

export const resources = { en, "pt-BR": ptBR, es, de };

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: typeof en;
    returnNull: false;
    strictKeyChecks: true;
  }
}

/** Fresh instances isolate tests and separate mounted applications. No backend/storage. */
export function createI18n(locale: Locale = browserLocale()): i18n {
  const instance = createInstance();
  void instance.use(initReactI18next).init({
    resources: structuredClone(resources),
    lng: locale,
    supportedLngs: [...locales],
    fallbackLng: "en",
    load: "currentOnly",
    defaultNS: "common",
    ns: ["common", "foundation"],
    initAsync: false,
    interpolation: { escapeValue: false }, // React escapes text; no HTML translations.
    returnNull: false,
    react: { useSuspense: false },
  });
  return instance;
}

export async function selectLanguage(instance: i18n, locale: Locale): Promise<void> {
  await instance.changeLanguage(locale);
}
