import { useTranslation } from "react-i18next";
import { Link } from "react-router";

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 max-w-lg flex-col gap-8">
      <h1 className="text-lg font-semibold">{t("navigation.notFound")}</h1>
      <p>{t("navigation.notFoundHint")}</p>
      <Link to="/">{t("navigation.backHome")}</Link>
    </div>
  );
}
