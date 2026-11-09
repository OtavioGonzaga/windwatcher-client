import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Button } from "../../shared/components/Button";
import { profileRepository } from "../../shared/storage/platform-storage";
import { useSession } from "../authentication/SessionOwner";
import type { SessionStatus } from "../authentication/service";
import { errorKey } from "../authentication/error-key";
import type { AccountRecord, ClientStateV2 } from "../server-profiles/schema";
import { StorageNotice } from "../server-profiles/StorageNotice";

function accountStatus(account: AccountRecord, state: ClientStateV2, status: SessionStatus) {
  if (state.selectedAccountId !== account.id)
    return account.session ? "accounts.status.saved" : "accounts.status.signedOut";
  if (status.kind === "ready" && status.accountId === account.id) return "accounts.status.verified";
  if (status.kind === "needs-login" && status.accountId === account.id) {
    const reason = status.reason;
    return reason === "expired"
      ? "auth.errors.expired"
      : reason === "disabled"
        ? "auth.errors.disabled"
        : reason === "identity"
          ? "auth.errors.identity"
          : reason === "missing"
            ? "auth.errors.missing"
            : reason === "invalid"
              ? "auth.errors.session"
              : "auth.errors.recovery";
  }
  if (status.kind === "error") return `auth.errors.${errorKey(status.category)}` as const;
  return "accounts.status.checking";
}

export function AccountSwitcher() {
  const { t } = useTranslation();
  const { owner, status } = useSession();
  const [state, setState] = useState<ClientStateV2>();
  const [error, setError] = useState<unknown>();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string>();
  const [confirmation, setConfirmation] = useState<{
    action: "logout" | "remove";
    account: AccountRecord;
  }>();
  const dialog = useRef<HTMLDialogElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<string | undefined>(undefined);
  const reload = useRef<() => void>(() => {});
  useEffect(() => {
    const lifetime = { active: true };
    let sequence = 0;
    let unsubscribe: (() => void) | undefined;
    void profileRepository()
      .then((repository) => {
        if (!lifetime.active) return;
        const load = () => {
          const ticket = ++sequence;
          void repository
            .load()
            .then((next) => {
              if (lifetime.active && ticket === sequence) {
                setState(next);
              }
            })
            .catch((failure: unknown) => {
              if (lifetime.active && ticket === sequence) setError(failure);
            });
        };
        reload.current = load;
        unsubscribe = repository.watch(load);
        load();
      })
      .catch((failure: unknown) => {
        if (lifetime.active) setError(failure);
      });
    return () => {
      lifetime.active = false;
      unsubscribe?.();
    };
  }, []);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else if (dialog.current?.open) dialog.current.close();
  }, [open]);
  useEffect(() => {
    if (confirmation) confirmButton.current?.focus();
    else if (open && returnFocus.current) {
      const target = dialog.current?.querySelector<HTMLButtonElement>(
        `[data-account-action="${returnFocus.current}"]`,
      );
      (target ?? dialog.current?.querySelector<HTMLButtonElement>("button"))?.focus();
      returnFocus.current = undefined;
    }
  }, [confirmation, open]);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(undefined);
    setResult(undefined);
    try {
      await action();
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
      reload.current();
    }
  };
  const selected = state?.accounts.find((a) => a.id === state.selectedAccountId);
  const selectedProfile = state?.serverProfiles.find((p) => p.id === selected?.serverProfileId);
  const close = () => {
    setOpen(false);
    setConfirmation(undefined);
    trigger.current?.focus();
  };
  return (
    <div className="min-w-0 text-sm font-normal">
      <Button
        ref={trigger}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="max-w-full"
        onClick={() => setOpen(true)}
      >
        {t("accounts.title")}
        {selected && selectedProfile && (
          <span className="min-w-0 break-all">{`: ${selected.username} — ${selectedProfile.label} (${selectedProfile.canonicalUrl})`}</span>
        )}
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby="account-switcher-title"
        onClose={close}
        className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-lg border border-border bg-surface p-4 text-foreground shadow-xl backdrop:bg-black/50"
      >
        {open && (
          <>
            <div className="flex items-start justify-between gap-3">
              <h2 id="account-switcher-title" className="text-lg font-semibold">
                {t("accounts.title")}
              </h2>
              <Button onClick={close}>{t("accounts.close")}</Button>
            </div>
            {error !== undefined && (
              <div role="alert">
                <StorageNotice error={error} />
                <Button onClick={() => reload.current()}>{t("auth.retry")}</Button>
              </div>
            )}
            <output className="my-3 block">{result}</output>
            {confirmation ? (
              <fieldset className="flex min-w-0 flex-col gap-3 [overflow-wrap:anywhere]">
                <legend className="max-w-full font-semibold">
                  {t(
                    confirmation.action === "logout"
                      ? "accounts.confirmLogout"
                      : "accounts.confirmRemove",
                    {
                      username: confirmation.account.username,
                      server: state?.serverProfiles.find(
                        (p) => p.id === confirmation.account.serverProfileId,
                      )?.canonicalUrl,
                    },
                  )}
                </legend>
                <p>
                  {t(
                    confirmation.action === "logout"
                      ? "accounts.logoutWarning"
                      : "accounts.removeWarning",
                  )}
                </p>
                <Button
                  ref={confirmButton}
                  disabled={busy || !owner}
                  onClick={() => {
                    const { action, account } = confirmation;
                    void run(async () => {
                      if (!owner) return;
                      if (action === "logout") {
                        const outcome = await owner.logoutAccount(account.id);
                        setResult(
                          t(
                            outcome.remoteRevocation === "confirmed"
                              ? "accounts.logoutConfirmed"
                              : "accounts.logoutUnconfirmed",
                            { username: account.username },
                          ),
                        );
                      } else {
                        await owner.removeSavedAccount(account.id);
                        setResult(t("accounts.removed", { username: account.username }));
                      }
                      setConfirmation(undefined);
                    });
                  }}
                >
                  {t("accounts.confirm")}
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => {
                    setConfirmation(undefined);
                  }}
                >
                  {t("discovery.cancel")}
                </Button>
              </fieldset>
            ) : (
              <>
                {state?.accounts.length === 0 && <p>{t("accounts.empty")}</p>}
                <Button
                  disabled={busy || !owner}
                  onClick={() => {
                    void run(() => owner!.switchAccount(null));
                  }}
                >
                  {t("accounts.clear")}
                </Button>
                <ul className="my-4 flex flex-col gap-4" aria-label={t("accounts.title")}>
                  {state?.serverProfiles.map((profile) => (
                    <li key={profile.id} className="min-w-0 rounded-md border border-border p-3">
                      <h3 className="break-words font-semibold">{profile.label}</h3>
                      <p className="break-all">{profile.canonicalUrl}</p>
                      <ul className="my-3 flex flex-col gap-3">
                        {state.accounts
                          .filter((a) => a.serverProfileId === profile.id)
                          .map((account) => {
                            const description = {
                              username: account.username,
                              server: profile.canonicalUrl,
                            };
                            return (
                              <li key={account.id} className="min-w-0 border-t border-border pt-3">
                                <p className="break-all font-medium">
                                  {account.username}{" "}
                                  <span className="text-xs font-normal">
                                    {account.serverUserId.slice(0, 8)}
                                  </span>
                                </p>
                                <p>{t(accountStatus(account, state, status))}</p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <Button
                                    disabled={busy || !owner}
                                    aria-current={
                                      state.selectedAccountId === account.id ? "true" : undefined
                                    }
                                    aria-label={t("accounts.switchLabel", description)}
                                    onClick={() => {
                                      void run(() => owner!.switchAccount(account.id));
                                    }}
                                  >
                                    {t("accounts.select")}
                                  </Button>
                                  <Link
                                    className="inline-flex min-h-11 items-center underline"
                                    onClick={close}
                                    aria-label={t("accounts.signInLabel", description)}
                                    to={`/servers/${profile.id}/login?account=${encodeURIComponent(account.id)}`}
                                  >
                                    {t("auth.signIn")}
                                  </Link>
                                  <Button
                                    disabled={busy}
                                    data-account-action={`logout-${account.id}`}
                                    aria-label={t("accounts.logoutLabel", description)}
                                    onClick={() => {
                                      returnFocus.current = `logout-${account.id}`;
                                      setConfirmation({ action: "logout", account });
                                    }}
                                  >
                                    {t("accounts.logout")}
                                  </Button>
                                  <Button
                                    disabled={busy}
                                    data-account-action={`remove-${account.id}`}
                                    aria-label={t("accounts.removeLabel", description)}
                                    onClick={() => {
                                      returnFocus.current = `remove-${account.id}`;
                                      setConfirmation({ action: "remove", account });
                                    }}
                                  >
                                    {t("accounts.remove")}
                                  </Button>
                                </div>
                              </li>
                            );
                          })}
                      </ul>
                      <Link
                        className="inline-flex min-h-11 items-center underline"
                        onClick={close}
                        to={`/servers/${profile.id}/login`}
                        aria-label={`${t("accounts.add")} — ${profile.canonicalUrl}`}
                      >
                        {t("accounts.add")}
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link
                  className="inline-flex min-h-11 items-center underline"
                  onClick={close}
                  to="/connect"
                >
                  {t("accounts.addServer")}
                </Link>
              </>
            )}
          </>
        )}
      </dialog>
    </div>
  );
}
