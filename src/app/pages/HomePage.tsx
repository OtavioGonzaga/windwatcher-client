import { useTranslation } from "react-i18next";
import { Link, Navigate } from "react-router";
import { ServerProfilesList } from "../../features/server-profiles/ServerProfilesList";
import { useSession } from "../../features/authentication/SessionOwner";
import { AccountSwitcher } from "../../features/accounts/AccountSwitcher";

export function HomePage() {
  const { t: foundation } = useTranslation("foundation");
  const { t } = useTranslation();
  const { status } = useSession();
  if (status.kind === "ready") return <Navigate replace to="/conversations" />;
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <img
        src={`${import.meta.env.BASE_URL}brand/windwatcher-banner.png`}
        alt=""
        width={543}
        height={181}
        className="h-auto w-full rounded-md bg-brand-backdrop p-4"
      />
      <h1 id="route-heading" tabIndex={-1} className="text-2xl font-semibold">
        Windwatcher
      </h1>
      <p className="text-secondary">{foundation("description")}</p>
      {(status.kind === "signed-out" || status.kind === "error") && (
        <>
          <Link to="/connect" className="action-link self-start">
            {t("discovery.title")}
          </Link>
          <ServerProfilesList manage={false} />
        </>
      )}
    </div>
  );
}

export function ServersPage() {
  const { t } = useTranslation();
  return (
    <section className="flex min-w-0 flex-col gap-5">
      <h1 id="route-heading" tabIndex={-1} className="text-2xl font-semibold">
        {t("accounts.title")}
      </h1>
      <div className="flex flex-wrap items-start gap-3">
        <AccountSwitcher manage />
        <Link to="/connect" className="action-link self-start">
          {t("discovery.title")}
        </Link>
      </div>
      <ServerProfilesList />
    </section>
  );
}
