import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { PresentationControls } from "../../shared/components/PresentationControls";

export function PreferencesPage() {
  const { t } = useTranslation();
  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-8 p-5">
      <h1>{t("navigation.preferences")}</h1>
      <PresentationControls />
      <Link to="/">{t("navigation.home")}</Link>
    </main>
  );
}
