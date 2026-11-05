import { useTranslation } from "react-i18next";
import { Link } from "react-router";

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-8 p-5">
      <h1>{t("navigation.notFound")}</h1>
      <p>{t("navigation.notFoundHint")}</p>
      <Link to="/">{t("navigation.backHome")}</Link>
    </main>
  );
}
