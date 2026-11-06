import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError } from "../../shared/api/error";
import { apiUrl, ServerUrl, ServerUrlError } from "../../shared/api/url";
import { Button } from "../../shared/components/Button";
import { TextField } from "../../shared/components/TextField";
import { platformHttp } from "../../shared/platform/http";
import { discoverServer, LegacyProbeError } from "./discover-server";
import type { DiscoveryResult } from "./discover-server";
import { canDiscoverLocalServer } from "../../shared/platform/native-target";
import { LocalServerSuggestion } from "./LocalServerSuggestion";

export function AddServerPage() {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const [editing, setEditing] = useState(0);
  const [invalid, setInvalid] = useState(false);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<DiscoveryResult | null>(null);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const attempt = useRef<AbortController | null>(null);
  let base: ServerUrl | undefined;
  let reason: ServerUrlError["reason"] = "invalid";
  try {
    base = ServerUrl.parse(input);
  } catch (error) {
    if (error instanceof ServerUrlError) reason = error.reason;
  }
  const cancel = () => {
    const active = attempt.current;
    attempt.current = null;
    active?.abort();
    setChecking(false);
  };
  useEffect(
    () => () => {
      attempt.current?.abort();
      attempt.current = null;
    },
    [],
  );
  const submit = async () => {
    if (!base || attempt.current) {
      if (!base) {
        setInvalid(true);
        inputRef.current?.focus();
      }
      return;
    }
    const root = base.toString();
    const controller = new AbortController();
    attempt.current = controller;
    setInvalid(false);
    setFailure(null);
    setResult(null);
    setAcknowledged(false);
    setChecking(true);
    try {
      const transport = await platformHttp();
      if (controller.signal.aborted) return;
      const next = await discoverServer(root, transport, controller.signal);
      if (attempt.current === controller) setResult(next);
    } catch (error) {
      if (
        attempt.current === controller &&
        error instanceof ApiError &&
        error.category !== "cancelled"
      )
        setFailure(error);
      else if (attempt.current === controller && !(error instanceof ApiError))
        setFailure(new ApiError("transport"));
    } finally {
      if (attempt.current === controller) {
        attempt.current = null;
        setChecking(false);
      }
    }
  };
  const failureKey =
    (failure?.category === "http" || failure?.category === "invalid-response") &&
    failure.metadata.status === 429
      ? "rateLimit"
      : (failure?.category === "http" || failure?.category === "invalid-response") &&
          (failure.metadata.status === 401 || failure.metadata.status === 403)
        ? "access"
        : failure?.category === "http" ||
            (failure?.category === "invalid-response" && (failure.metadata.status ?? 0) >= 500)
          ? "serverError"
          : failure?.category === "timeout"
            ? "timeout"
            : failure?.category === "redirect"
              ? "redirect"
              : failure?.category === "transport"
                ? "network"
                : failure?.category === "response-too-large"
                  ? "tooLarge"
                  : "invalidResponse";
  return (
    <div className="flex min-w-0 max-w-lg flex-col gap-6">
      <h1 id="route-heading" tabIndex={-1} className="text-lg font-semibold">
        {t("discovery.title")}
      </h1>
      <p>{t("discovery.intro")}</p>
      <form
        className="flex min-w-0 flex-col gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <TextField
          id="server-url"
          ref={inputRef}
          label={t("discovery.url")}
          hint={t("discovery.hint")}
          {...(invalid ? { error: t(`discovery.urlError.${reason}`) } : {})}
          value={input}
          onChange={(event) => {
            cancel();
            setEditing((previous) => previous + 1);
            setInput(event.target.value);
            setInvalid(false);
            setResult(null);
            setFailure(null);
            setAcknowledged(false);
          }}
          autoComplete="url"
          inputMode="url"
        />
        {base && (
          <p className="break-all text-sm">
            {t("discovery.endpoint")}: {apiUrl(base, ["instance"]).href}
          </p>
        )}
        {base && base.toString().startsWith("http:") && (
          <p className="text-sm">{t("discovery.httpWarning")}</p>
        )}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" variant="primary" disabled={checking}>
            {t("discovery.check")}
          </Button>
          {checking && <Button onClick={cancel}>{t("discovery.cancel")}</Button>}
        </div>
      </form>
      {canDiscoverLocalServer() && (
        <LocalServerSuggestion
          editing={editing}
          onUse={(root) => {
            cancel();
            setInput(root);
            setInvalid(false);
            setResult(null);
            setFailure(null);
            setAcknowledged(false);
            inputRef.current?.focus();
          }}
        />
      )}
      <output aria-live="polite">
        {checking && <p>{t("discovery.checking")}</p>}
        {failure && (
          <div>
            {failure instanceof LegacyProbeError && <p>{t("discovery.probeFailed")}</p>}
            <p>{t(`discovery.${failureKey}`)}</p>
            {failure.metadata.status && (
              <p>
                {t("discovery.status")}: {failure.metadata.status}
              </p>
            )}
            {failure.metadata.requestId && (
              <p className="break-all">
                {t("discovery.requestId")}: {failure.metadata.requestId}
              </p>
            )}
          </div>
        )}
        {result && (
          <div className="flex flex-col gap-3">
            <p className="break-all">{result.root}</p>
            {result.kind === "supported" && (
              <>
                <p>{t("discovery.supported")}</p>
                <p>
                  {t(
                    result.metadata.registration === "open" ? "discovery.open" : "discovery.closed",
                  )}
                </p>
                <p>{t("discovery.notImplemented")}</p>
              </>
            )}
            {result.kind === "wrong-service" && <p>{t("discovery.wrongService")}</p>}
            {result.kind === "unsupported-api" && <p>{t("discovery.unsupportedApi")}</p>}
            {result.kind === "unsupported-auth" && <p>{t("discovery.unsupportedAuth")}</p>}
            {(result.kind === "unsupported-api" || result.kind === "unsupported-auth") &&
              result.advertised.length > 0 && (
                <p className="break-all">{result.advertised.join(", ")}</p>
              )}
            {result.kind === "legacy" && (
              <>
                <p>
                  {t(result.recognized ? "discovery.legacyRecognized" : "discovery.legacyUnknown")}
                </p>
                <label className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-5 shrink-0"
                    checked={acknowledged}
                    onChange={(event) => setAcknowledged(event.target.checked)}
                  />
                  {t("discovery.acknowledge")}
                </label>
                {acknowledged && <p>{t("discovery.legacySummary")}</p>}
              </>
            )}
          </div>
        )}
      </output>
    </div>
  );
}
