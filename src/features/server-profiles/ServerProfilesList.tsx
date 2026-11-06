import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Button } from "../../shared/components/Button";
import { TextField } from "../../shared/components/TextField";
import { profileRepository } from "../../shared/storage/platform-storage";
import { formatDate } from "../../shared/i18n/format";
import { resolveLocale } from "../../shared/i18n/locale";
import type { ClientStateV2, ServerProfile } from "./schema";
import { StorageNotice } from "./StorageNotice";

function ProfileRow({
  profile,
  accounts,
  busy,
  change,
}: {
  profile: ServerProfile;
  accounts: number;
  busy: boolean;
  change: (action: "rename" | "forget", id: string, label: string) => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const prefix = `profile-${profile.id}`;
  const addressId = `${prefix}-address`;
  const labelId = `${prefix}-label-input`;
  const [label, setLabel] = useState(profile.label);
  const [confirm, setConfirm] = useState(false);
  const forget = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirm) confirmButton.current?.focus();
  }, [confirm]);
  return (
    <li
      className="flex min-w-0 flex-col gap-3 rounded-md border border-border p-4"
      aria-labelledby={`${prefix} ${addressId}`}
    >
      <h3 id={prefix} className="break-words font-semibold">
        {profile.label}
      </h3>
      <p id={addressId} className="break-all text-sm">
        {profile.canonicalUrl}
      </p>
      <p className="text-sm">
        <time dateTime={profile.discovery.inspectedAt}>
          {t("profiles.inspected", {
            time: formatDate(
              new Date(profile.discovery.inspectedAt),
              resolveLocale([i18n.resolvedLanguage ?? i18n.language]),
              { dateStyle: "medium", timeStyle: "short" },
            ),
          })}
        </time>
      </p>
      <p>{t(profile.discovery.kind === "legacy" ? "profiles.legacy" : "profiles.supported")}</p>
      <Link
        className="inline-flex min-h-11 items-center underline"
        to={`/connect?server=${encodeURIComponent(profile.canonicalUrl)}`}
        aria-labelledby={`${prefix}-inspect ${addressId}`}
      >
        <span id={`${prefix}-inspect`}>{t("profiles.inspect")}</span>
      </Link>
      <form
        className="flex min-w-0 flex-col gap-3"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void change("rename", profile.id, label);
        }}
      >
        <TextField
          id={labelId}
          label={t("profiles.label")}
          aria-labelledby={`${labelId}-label ${addressId}`}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          disabled={busy}
        />
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={busy} aria-labelledby={`${prefix}-rename ${addressId}`}>
            <span id={`${prefix}-rename`}>{t("profiles.rename")}</span>
          </Button>
          <Button
            ref={forget}
            disabled={busy}
            onClick={() => setConfirm(true)}
            aria-labelledby={`${prefix}-forget ${addressId}`}
          >
            <span id={`${prefix}-forget`}>{t("profiles.forget")}</span>
          </Button>
        </div>
      </form>
      {confirm && (
        <fieldset
          aria-labelledby={`${prefix}-confirm ${addressId}`}
          className="flex flex-col gap-3"
        >
          <p>
            {t(accounts > 0 ? "profiles.confirmAccounts" : "profiles.confirm", { count: accounts })}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              ref={confirmButton}
              aria-labelledby={`${prefix}-confirm ${addressId}`}
              disabled={busy}
              onClick={() => {
                void change("forget", profile.id, label);
              }}
            >
              <span id={`${prefix}-confirm`}>{t("profiles.confirmTitle")}</span>
            </Button>
            <Button
              disabled={busy}
              aria-labelledby={`${prefix}-cancel ${addressId}`}
              onClick={() => {
                setConfirm(false);
                forget.current?.focus();
              }}
            >
              <span id={`${prefix}-cancel`}>{t("discovery.cancel")}</span>
            </Button>
          </div>
        </fieldset>
      )}
    </li>
  );
}

export function ServerProfilesList() {
  const { t } = useTranslation();
  const [state, setState] = useState<ClientStateV2>();
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [reload, setReload] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const lifetime: { active: boolean; unsubscribe?: () => void } = { active: true };
    void profileRepository()
      .then(async (repository) => {
        if (!lifetime.active) return;
        lifetime.unsubscribe = repository.subscribe(() => {
          if (lifetime.active) {
            setState(undefined);
            setError("conflict");
          }
        });
        const next = await repository.load();
        if (lifetime.active) {
          setState(next);
          setError(undefined);
        }
      })
      .catch((failure: unknown) => {
        if (lifetime.active) setError(failure);
      });
    return () => {
      lifetime.active = false;
      lifetime.unsubscribe?.();
    };
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- Explicit reload intentionally repeats the storage read after errors/conflicts.
  }, [reload]);
  const change = async (action: "rename" | "forget", id: string, label: string) => {
    if (busy || !state) return;
    setBusy(true);
    setError(undefined);
    setSuccess(false);
    try {
      const repository = await profileRepository();
      const next = await (action === "rename"
        ? repository.renameProfile(id, label, state.revision)
        : repository.forgetProfile(id, state.revision));
      setState(next);
      setSuccess(true);
      if (action === "forget") heading.current?.focus();
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="flex min-w-0 flex-col gap-4" aria-labelledby="saved-servers">
      <h2 id="saved-servers" tabIndex={-1} ref={heading} className="font-semibold">
        {t("profiles.title")}
      </h2>
      {state?.serverProfiles.length === 0 && <p>{t("profiles.empty")}</p>}
      <ul className="flex min-w-0 flex-col gap-4">
        {state?.serverProfiles.map((profile) => (
          <ProfileRow
            key={profile.id}
            profile={profile}
            accounts={state.accounts.filter((a) => a.serverProfileId === profile.id).length}
            busy={busy}
            change={change}
          />
        ))}
      </ul>
      <div aria-live="polite">
        {success && <p>{t("profiles.changed")}</p>}
        {error !== undefined && <StorageNotice error={error} />}
      </div>
      {error !== undefined && (
        <Button disabled={busy} onClick={() => setReload((n) => n + 1)}>
          {t("profiles.reload")}
        </Button>
      )}
    </section>
  );
}
