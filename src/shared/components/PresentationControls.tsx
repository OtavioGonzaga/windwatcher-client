import { useId } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "../design-system/theme";
import { selectLanguage } from "../i18n";
import { isLocale, locales } from "../i18n/locale";

const selectClass =
  "min-h-[var(--control-height)] w-full min-w-0 rounded-sm border border-border bg-surface px-3 py-2 text-sm text-foreground";

export function PresentationControls() {
  const { t, i18n } = useTranslation();
  const { t: foundation } = useTranslation("foundation");
  const { mode, setMode } = useTheme();
  const id = useId();
  return (
    <fieldset className="w-full min-w-0">
      <legend className="mb-3 text-sm font-medium text-secondary">
        {foundation("preferences")}
      </legend>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2">
          <label htmlFor={`${id}-language`} className="text-sm">
            {t("language")}
          </label>
          <select
            id={`${id}-language`}
            className={selectClass}
            value={i18n.resolvedLanguage}
            onChange={(event) => {
              if (isLocale(event.target.value)) void selectLanguage(i18n, event.target.value);
            }}
          >
            {locales.map((locale) => (
              <option key={locale} value={locale} lang={locale}>
                {t(`languages.${locale}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <label htmlFor={`${id}-appearance`} className="text-sm">
            {t("appearance")}
          </label>
          <select
            id={`${id}-appearance`}
            className={selectClass}
            value={mode}
            onChange={(event) => {
              const value = event.target.value;
              if (value === "system" || value === "light" || value === "dark") setMode(value);
            }}
          >
            {(["system", "light", "dark"] as const).map((value) => (
              <option key={value} value={value}>
                {t(value)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="mt-4 text-sm text-muted">{foundation("temporary")}</p>
    </fieldset>
  );
}
