import { useTranslation } from "react-i18next";
import { PresentationControls } from "../../shared/components/PresentationControls";

export function PreferencesPage() {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 max-w-lg flex-col gap-8">
      <h1 id="route-heading" tabIndex={-1} className="text-lg font-semibold">
        {t("navigation.preferences")}
      </h1>
      <PresentationControls />
    </div>
  );
}
