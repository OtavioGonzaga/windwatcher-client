import { useTranslation } from "react-i18next";
import { Link } from "react-router";

export function HomePage() {
  const { t } = useTranslation();
  const { t: foundation } = useTranslation("foundation");
  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-8 p-5">
      <img
        src={`${import.meta.env.BASE_URL}brand/windwatcher-banner.png`}
        alt=""
        width={543}
        height={181}
        className="h-auto w-full rounded-md bg-brand-backdrop p-4"
      />
      <h1>Windwatcher</h1>
      <p className="text-secondary">{foundation("description")}</p>
      <Link to="/preferences">{t("navigation.preferences")}</Link>
    </main>
  );
}
