import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../shared/components/Button";
import { InlineNotice } from "../../shared/components/InlineNotice";
import { platformHttp } from "../../shared/platform/http";
import { discoverLocalServers } from "./local-discovery";
import type { LocalCandidate } from "./local-discovery";

export function LocalServerSuggestion({
  onUse,
  editing,
}: {
  onUse: (root: string) => void;
  editing: number;
}) {
  const { t } = useTranslation();
  const [scan, setScan] = useState({ editing: 0 });
  const [dismissed, setDismissed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [candidates, setCandidates] = useState<LocalCandidate[]>([]);
  const active = useRef<AbortController | null>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  const hidden = dismissed || scan.editing !== editing;
  useEffect(() => {
    if (dismissed || scan.editing !== editing) return undefined;
    const controller = new AbortController();
    active.current = controller;
    void (async () => {
      try {
        const transport = await platformHttp();
        if (controller.signal.aborted) return;
        await discoverLocalServers(transport, controller.signal, (candidate) => {
          if (active.current === controller && !controller.signal.aborted)
            setCandidates((previous) => [...previous, candidate]);
        });
      } catch {
        /* Optional advice must not block manual entry. */
      } finally {
        if (active.current === controller && !controller.signal.aborted) setChecking(false);
      }
    })();
    return () => {
      controller.abort();
      if (active.current === controller) active.current = null;
    };
  }, [scan, dismissed, editing]);
  const visible = candidates.filter(
    (candidate) =>
      candidate.kind === "supported" ||
      candidate.kind === "legacy" ||
      candidate.kind === "unsupported-api" ||
      candidate.kind === "unsupported-auth",
  );
  return (
    <section aria-label={t("localDiscovery.title")} className="flex min-w-0 flex-col gap-3">
      {!hidden && (
        <InlineNotice announce="polite">
          {!hidden && (
            <div className="flex min-w-0 flex-col gap-3">
              <p>
                {t(
                  checking
                    ? "localDiscovery.checking"
                    : visible.length
                      ? "localDiscovery.found"
                      : "localDiscovery.none",
                )}
              </p>
              {visible.map((candidate) => (
                <div key={candidate.root} className="flex min-w-0 flex-col gap-2">
                  <p className="break-all">{candidate.root}</p>
                  <p>
                    {t(
                      candidate.kind === "supported"
                        ? candidate.readiness === "ready"
                          ? "localDiscovery.ready"
                          : candidate.readiness === "not-ready"
                            ? "localDiscovery.notReady"
                            : "localDiscovery.unknown"
                        : candidate.kind === "legacy"
                          ? "localDiscovery.legacy"
                          : "localDiscovery.incompatible",
                    )}
                  </p>
                  {(candidate.kind === "legacy" ||
                    (candidate.kind === "supported" && candidate.readiness === "ready")) && (
                    <Button
                      aria-label={t("localDiscovery.useSpecific", { address: candidate.root })}
                      onClick={() => {
                        active.current?.abort();
                        setDismissed(true);
                        onUse(candidate.root);
                      }}
                    >
                      {t("localDiscovery.use")}
                    </Button>
                  )}
                </div>
              ))}
              {visible.length > 0 && <p>{t("discovery.httpWarning")}</p>}
            </div>
          )}
        </InlineNotice>
      )}
      <div className="flex flex-wrap gap-3">
        <Button
          ref={retryRef}
          onClick={() => {
            active.current?.abort();
            setDismissed(false);
            setCandidates([]);
            setChecking(true);
            setScan({ editing });
          }}
        >
          {t("localDiscovery.retry")}
        </Button>
        {!hidden && (
          <Button
            onClick={() => {
              active.current?.abort();
              setDismissed(true);
              retryRef.current?.focus();
            }}
          >
            {t("localDiscovery.dismiss")}
          </Button>
        )}
      </div>
    </section>
  );
}
