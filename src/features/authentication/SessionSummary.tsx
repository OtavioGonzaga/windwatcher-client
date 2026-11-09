import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Button } from "../../shared/components/Button";
import { useSession } from "./SessionOwner";
import { errorKey } from "./error-key";

export function SessionSummary() {
  const { t } = useTranslation();
  const { owner, status } = useSession();

  if (!status || status.kind === "signed-out") return null;
  return (
    <section className="flex flex-col gap-2" aria-live="polite">
      {status.kind === "restoring" && <p>{t("auth.restoring")}</p>}
      {status.kind === "ready" && <p>{t("auth.signedIn", { username: status.username })}</p>}
      {status.kind === "needs-login" && (
        <>
          <p>
            {t(
              status.reason === "expired"
                ? "auth.errors.expired"
                : status.reason === "disabled"
                  ? "auth.errors.disabled"
                  : status.reason === "identity"
                    ? "auth.errors.identity"
                    : status.reason === "missing"
                      ? "auth.errors.missing"
                      : "auth.errors.recovery",
            )}
          </p>
          <Link
            className="underline"
            to={`/servers/${status.profileId}/login?account=${encodeURIComponent(status.accountId)}`}
          >
            {t("auth.signIn")}
          </Link>
        </>
      )}
      {status.kind === "error" && (
        <>
          <p>{t(`auth.errors.${errorKey(status.category)}`)}</p>
          {status.retryAfterMs !== undefined && (
            <p>{t("auth.retryAfter", { seconds: Math.ceil(status.retryAfterMs / 1000) })}</p>
          )}
          <Button
            onClick={() => {
              void owner?.restoreSelected(new AbortController().signal);
            }}
          >
            {t("auth.retry")}
          </Button>
        </>
      )}
    </section>
  );
}
