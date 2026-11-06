import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { ServerProfilesList } from "../../features/server-profiles/ServerProfilesList";

export function HomePage() {
  const { t: foundation } = useTranslation("foundation");
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 max-w-lg flex-col gap-8">
      <img
        src={`${import.meta.env.BASE_URL}brand/windwatcher-banner.png`}
        alt=""
        width={543}
        height={181}
        className="h-auto w-full rounded-md bg-brand-backdrop p-4"
      />
      <h1 id="route-heading" tabIndex={-1} className="text-lg font-semibold">
        Windwatcher
      </h1>
      <p className="text-secondary">{foundation("description")}</p>
      <Link
        to="/connect"
        className="inline-flex min-h-11 items-center self-start rounded-sm bg-action px-4 text-on-action"
      >
        {t("discovery.title")}
      </Link>
      <ServerProfilesList />
    </div>
  );
}
