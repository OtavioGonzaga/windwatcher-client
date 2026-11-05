import { useEffect } from "react";
import type { ReactNode } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";
import type { i18n } from "i18next";
import { ThemeProvider } from "../shared/design-system/theme";

function DocumentLanguage() {
  const { i18n } = useTranslation();
  useEffect(() => {
    document.documentElement.lang = i18n.resolvedLanguage ?? "en";
  }, [i18n.resolvedLanguage]);
  return null;
}

export function Providers({ children, i18n }: { children: ReactNode; i18n: i18n }) {
  return (
    <I18nextProvider i18n={i18n}>
      <ThemeProvider>
        <DocumentLanguage />
        {children}
      </ThemeProvider>
    </I18nextProvider>
  );
}
