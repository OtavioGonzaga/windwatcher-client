import { Inbox, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, Outlet, useLocation, useMatch } from "react-router";
import { RouteEffects } from "./navigation/RouteEffects";
import { RouteErrorBoundary } from "./RouteErrorBoundary";
import { AndroidBack } from "./navigation/AndroidBack";
import { SessionSummary } from "../features/authentication/SessionSummary";
import { SessionOwner, useSession } from "../features/authentication/SessionOwner";
import { AccountSwitcher } from "../features/accounts/AccountSwitcher";

function BrandLink() {
  const { t } = useTranslation();
  const { status } = useSession();
  const ready = status.kind === "ready";
  return (
    <Link
      id="nav-home"
      to={ready ? "/conversations" : "/"}
      className="mr-auto inline-flex min-h-11 items-center text-lg"
      aria-label={`Windwatcher — ${t(ready ? "conversations.inbox" : "navigation.home")}`}
    >
      Windwatcher
    </Link>
  );
}

export function AppShell() {
  const { t } = useTranslation();
  const location = useLocation();
  const inbox = useMatch("/conversations");
  const composingDirect = useMatch("/conversations/new");
  const conversation = useMatch("/conversations/:conversationId");
  const managingAccounts = useMatch("/servers");
  const workspace = Boolean(inbox || (conversation && !composingDirect));
  return (
    <SessionOwner>
      <div
        className={`shell-viewport grid min-h-dvh min-w-0 grid-cols-1 grid-rows-[auto_1fr_auto] bg-background text-foreground ${workspace ? "conversation-shell" : ""}`}
      >
        <a
          href="#main-content"
          className="skip-link"
          onClick={(event) => {
            event.preventDefault();
            document.getElementById("main-content")?.focus();
            document.getElementById("main-content")?.scrollIntoView();
          }}
        >
          {t("navigation.skip")}
        </a>
        <RouteEffects />
        <header className="min-w-0 border-b border-border bg-surface px-4 py-2 font-medium sm:px-6">
          <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2">
            <BrandLink />
            {!managingAccounts && <AccountSwitcher />}
            <nav
              aria-label={t("navigation.label")}
              className="flex w-full min-w-0 flex-wrap gap-2 border-t border-border pt-2 md:w-auto md:border-0 md:pt-0"
            >
              <NavLink id="nav-inbox" to="/conversations" className="shell-link">
                <Inbox aria-hidden="true" size={20} strokeWidth={1.75} />
                <span>{t("conversations.inbox")}</span>
              </NavLink>
              <NavLink id="nav-preferences" to="/preferences" className="shell-link">
                <Settings aria-hidden="true" size={20} strokeWidth={1.75} />
                <span>{t("navigation.settings")}</span>
              </NavLink>
            </nav>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="row-start-2 min-h-0 min-w-0">
          <div
            className={
              workspace
                ? "flex h-full min-w-0 flex-col"
                : "mx-auto w-full max-w-2xl px-4 py-6 sm:px-6"
            }
          >
            <AndroidBack />
            <SessionSummary showReady={Boolean(managingAccounts)} />
            <RouteErrorBoundary
              resetKey={location.key}
              key={workspace ? "workspace" : location.key}
            >
              <Outlet />
            </RouteErrorBoundary>
          </div>
        </main>
      </div>
    </SessionOwner>
  );
}
