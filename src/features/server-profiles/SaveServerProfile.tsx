import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../shared/components/Button";
import { TextField } from "../../shared/components/TextField";
import { profileRepository } from "../../shared/storage/platform-storage";
import type { DiscoveryResult } from "../server-discovery/discover-server";
import type { ClientStateV1 } from "./schema";
import { defaultLabel } from "./repository";
import { StorageNotice } from "./StorageNotice";

export function SaveServerProfile({
  result,
  acknowledged,
}: {
  result: DiscoveryResult;
  acknowledged: boolean;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<ClientStateV1>();
  const [label, setLabel] = useState(defaultLabel(result.root));
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [reload, setReload] = useState(0);
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
          setLabel(
            next.serverProfiles.find((p) => p.canonicalUrl === result.root)?.label ??
              defaultLabel(result.root),
          );
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
  }, [result.root, reload]);
  const existing = state?.serverProfiles.find((p) => p.canonicalUrl === result.root);
  return (
    <section aria-label={t("profiles.save")} className="flex min-w-0 flex-col gap-3">
      {existing && (
        <p className="break-words">{t("profiles.existing", { label: existing.label })}</p>
      )}
      <form
        className="flex min-w-0 flex-col gap-3"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (busy || !state) return;
          setBusy(true);
          setSaved(false);
          setError(undefined);
          void profileRepository()
            .then((repository) =>
              repository.saveInspection(result, label, acknowledged, !!existing, state.revision),
            )
            .then((next) => {
              setState(next);
              setSaved(true);
            })
            .catch((failure: unknown) => setError(failure))
            .finally(() => setBusy(false));
        }}
      >
        <TextField
          label={t("profiles.label")}
          hint={t("profiles.labelHint")}
          value={label}
          onChange={(event) => {
            setLabel(event.target.value);
            setSaved(false);
          }}
          disabled={busy}
        />
        <Button type="submit" disabled={busy || !state}>
          {t(existing ? "profiles.update" : "profiles.save")}
        </Button>
      </form>
      <div aria-live="polite">
        {saved && <p>{t("profiles.saved")}</p>}
        {error !== undefined && <StorageNotice error={error} />}
      </div>
      {error !== undefined && (
        <Button
          disabled={busy}
          onClick={() => {
            setState(undefined);
            setReload((n) => n + 1);
          }}
        >
          {t("profiles.reload")}
        </Button>
      )}
    </section>
  );
}
