import { useState } from "react";
import { createRoot } from "react-dom/client";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Providers } from "../../src/app/Providers";
import { Button } from "../../src/shared/components/Button";
import { IconButton } from "../../src/shared/components/IconButton";
import { TextField } from "../../src/shared/components/TextField";
import { InlineNotice } from "../../src/shared/components/InlineNotice";
import { PresentationControls } from "../../src/shared/components/PresentationControls";
import { initializeTheme } from "../../src/shared/design-system/theme";
import { createI18n } from "../../src/shared/i18n";
import { formatDate, formatNumber } from "../../src/shared/i18n/format";
import { resolveLocale } from "../../src/shared/i18n/locale";
import "../../src/app/styles.css";

function Showcase() {
  const { t, i18n } = useTranslation("foundation");
  const { t: common } = useTranslation();
  const [value, setValue] = useState("");
  const [reset, setReset] = useState(false);
  const locale = resolveLocale([i18n.resolvedLanguage ?? "en"]);
  return (
    <main data-foundation-showcase className="min-h-dvh bg-background p-5 text-foreground sm:p-10">
      <div className="mx-auto flex max-w-xl flex-col gap-6">
        <h1 className="text-lg font-semibold">{t("showcase")}</h1>
        <p>{t("showcaseHint")}</p>
        <PresentationControls />
        <TextField
          label={t("serverLabel")}
          hint={t("serverHint")}
          error={t("serverError")}
          type="url"
          placeholder={t("serverPlaceholder")}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <div className="flex flex-wrap items-start gap-3">
          <Button
            variant="primary"
            onClick={() => {
              setValue("");
              setReset(true);
            }}
          >
            {common("reset")}
          </Button>
          <IconButton label={common("clear")} onClick={() => setValue("")}>
            <X size={20} strokeWidth={1.75} />
          </IconButton>
          <Button disabled>{common("reset")}</Button>
          <Button variant="destructive" onClick={() => setValue("")}>
            {common("clear")}
          </Button>
        </div>
        <InlineNotice>{t("info")}</InlineNotice>
        <InlineNotice tone="warning">{t("warning")}</InlineNotice>
        <InlineNotice tone="error">{t("error")}</InlineNotice>
        <InlineNotice tone="success" announce="polite">
          {reset ? t("success") : ""}
        </InlineNotice>
        <p>
          {t("greeting", { name: "Windwatcher" })} {t("examples", { count: 4 })}
        </p>
        <p className="font-mono text-xs">
          {t("sample")}: {formatNumber(1234.5, locale)} ·{" "}
          {formatDate(new Date("2026-11-05T12:00:00Z"), locale, {
            dateStyle: "medium",
            timeZone: "UTC",
          })}
        </p>
      </div>
    </main>
  );
}

initializeTheme();
const root = document.getElementById("root");
if (!root) throw new Error("Showcase root is missing.");
createRoot(root).render(
  <Providers i18n={createI18n()}>
    <Showcase />
  </Providers>,
);
