import { Home, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet } from "react-router";

export function AppShell() {
  const { t } = useTranslation();
  return (
    <div className="grid min-h-dvh min-w-0 grid-cols-1 grid-rows-[auto_1fr_auto] bg-background text-foreground md:grid-cols-[14rem_minmax(0,1fr)] md:grid-rows-[auto_1fr]">
      <header className="min-w-0 border-b border-border px-5 py-4 font-medium md:col-span-2">
        Windwatcher
      </header>
      <nav
        aria-label={t("navigation.label")}
        className="row-start-3 flex min-w-0 gap-2 border-t border-border bg-surface p-3 md:col-start-1 md:row-start-2 md:flex-col md:border-t-0 md:border-r md:p-4"
      >
        <NavLink to="/" end className="shell-link">
          <Home aria-hidden="true" size={20} strokeWidth={1.75} />
          <span>{t("navigation.home")}</span>
        </NavLink>
        <NavLink to="/preferences" className="shell-link">
          <Settings aria-hidden="true" size={20} strokeWidth={1.75} />
          <span>{t("navigation.preferences")}</span>
        </NavLink>
      </nav>
      <main
        id="main-content"
        tabIndex={-1}
        className="row-start-2 min-w-0 px-5 py-8 md:col-start-2 md:p-10"
      >
        <div className="mx-auto w-full max-w-2xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
