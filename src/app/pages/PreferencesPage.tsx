import { useTranslation } from "react-i18next";
import { PresentationControls } from "../../shared/components/PresentationControls";
import { Link } from "react-router";

export function PreferencesPage() {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 max-w-lg flex-col gap-8">
      <h1 id="route-heading" tabIndex={-1} className="text-2xl font-semibold">
        {t("navigation.settings")}
      </h1>
      <PresentationControls />
      <Link to="/servers" className="inline-flex min-h-11 items-center self-start underline">
        {t("accounts.title")}
      </Link>
    </div>
  );
}
