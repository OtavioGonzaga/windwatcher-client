import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Button } from "../../shared/components/Button";
import { authenticationService } from "./platform-authentication";
import type { SessionStatus } from "./service";

export function SessionSummary() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<SessionStatus>();
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let unsubscribe: (() => void) | undefined;
    void authenticationService()
      .then((owner) => {
        if (controller.signal.aborted) return;
        const update = () => setStatus(owner.getSnapshot());
        unsubscribe = owner.subscribe(update);
        update();
        void owner.restoreSelected(controller.signal);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setStatus({ kind: "error", category: "storage-unavailable" });
      });
    return () => {
      controller.abort();
      unsubscribe?.();
    };
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- Retry explicitly starts a new restoration attempt.
  }, [retry]);

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
          <p>
            {t(
              status.category === "coordination"
                ? "auth.errors.coordination"
                : status.category === "storage-locked"
                  ? "auth.errors.locked"
                  : "auth.errors.storage",
            )}
          </p>
          <Button onClick={() => setRetry((value) => value + 1)}>{t("auth.retry")}</Button>
        </>
      )}
    </section>
  );
}
