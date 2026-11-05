import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Routes, Route } from "react-router";
import { useTranslation } from "react-i18next";
import { Providers } from "../../src/app/Providers";
import { AppShell } from "../../src/app/AppShell";
import { HomePage } from "../../src/app/pages/HomePage";
import { PreferencesPage } from "../../src/app/pages/PreferencesPage";
import { NotFoundPage } from "../../src/app/pages/NotFoundPage";
import { TextField } from "../../src/shared/components/TextField";
import { createI18n } from "../../src/shared/i18n";
import { initializeTheme } from "../../src/shared/design-system/theme";
import "../../src/app/styles.css";

function KeyboardFixture() {
  const { t } = useTranslation("foundation");
  return (
    <div data-shell-keyboard-fixture>
      <PreferencesPage />
      <div className="mt-[60vh] pb-8">
        <TextField id="keyboard-field" label={t("serverLabel")} hint={t("showcaseHint")} />
      </div>
    </div>
  );
}
const root = document.getElementById("root");
if (!root) throw new Error("Shell fixture root is missing.");
initializeTheme();
createRoot(root).render(
  <StrictMode>
    <Providers i18n={createI18n()}>
      <HashRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/preferences" element={<KeyboardFixture />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </Providers>
  </StrictMode>,
);
