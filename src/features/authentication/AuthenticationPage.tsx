import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { ApiError } from "../../shared/api/error";
import { Button } from "../../shared/components/Button";
import { InlineNotice } from "../../shared/components/InlineNotice";
import { TextField } from "../../shared/components/TextField";
import { platformHttp } from "../../shared/platform/http";
import { discoverServer } from "../server-discovery/discover-server";
import type { ServerProfile } from "../server-profiles/schema";
import { authenticationService } from "./platform-authentication";
import { sessionError } from "./service";
import type { SessionError } from "./service";

function errorKey(category: SessionError) {
  if (category === "invalid-credentials") return "credentials";
  if (category === "disabled") return "disabled";
  if (category === "username-taken") return "usernameTaken";
  if (category === "invalid-username") return "username";
  if (category === "invalid-password") return "password";
  if (category === "identity") return "identity";
  if (category === "recovery-required") return "recovery";
  if (category === "expired") return "expired";
  if (category === "missing") return "missing";
  if (category === "coordination") return "coordination";
  if (category === "clock") return "clock";
  if (category === "storage-locked") return "locked";
  if (category === "storage-too-large") return "capacity";
  if (category.startsWith("storage-")) return "storage";
  if (category === "invalid-access" || category === "invalid-refresh") return "session";
  if (category === "malformed") return "malformed";
  if (category === "too-large") return "requestTooLarge";
  if (
    category === "bad-request" ||
    category === "invalid-input" ||
    category === "registration-closed"
  )
    return "request";
  return "unknown";
}

export function AuthenticationPage({ registration = false }: { registration?: boolean }) {
  const { t } = useTranslation();
  const { profileId = "" } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ServerProfile>();
  const [policy, setPolicy] = useState<"checking" | "open" | "closed" | "legacy" | "failed">(
    "checking",
  );
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<SessionError>();
  const [retryAfter, setRetryAfter] = useState<number>();
  const [success, setSuccess] = useState(false);
  const [ambiguous, setAmbiguous] = useState(false);
  const [validation, setValidation] = useState<
    "username" | "password" | "confirmation" | "policy"
  >();
  const username = useRef<HTMLInputElement>(null);
  const password = useRef<HTMLInputElement>(null);
  const confirmation = useRef<HTMLInputElement>(null);
  const active = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    // oxlint-disable-next-line react/set-state-in-effect -- Reset the previously inspected server before starting a new async inspection.
    setPolicy("checking");
    setProfile(undefined);
    void (async () => {
      const service = await authenticationService();
      const saved = await service.profile(profileId);
      if (controller.signal.aborted) return;
      setProfile(saved);
      if (!registration) {
        setPolicy("open");
        return;
      }
      const transport = await platformHttp();
      const result = await discoverServer(saved.canonicalUrl, transport, controller.signal);
      if (controller.signal.aborted) return;
      if (result.kind === "supported") setPolicy(result.metadata.registration);
      else if (result.kind === "legacy" && saved.discovery.kind === "legacy") setPolicy("legacy");
      else setPolicy("failed");
    })().catch(() => {
      if (!controller.signal.aborted) setPolicy("failed");
    });
    return () => {
      controller.abort();
      active.current?.abort();
      active.current = null;
    };
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- Explicit reinspection invalidates the previous policy.
  }, [profileId, registration, refresh]);

  async function submit() {
    if (
      !profile ||
      profile.id !== profileId ||
      busy ||
      (registration && policy !== "open" && policy !== "legacy")
    )
      return;
    const name = username.current?.value ?? "";
    const secret = password.current?.value ?? "";
    if (!name) {
      setValidation("username");
      username.current?.focus();
      return;
    }
    if (!secret) {
      setValidation("password");
      password.current?.focus();
      return;
    }
    if (registration && secret !== confirmation.current?.value) {
      setValidation("confirmation");
      confirmation.current?.focus();
      return;
    }
    if (
      registration &&
      (Array.from(secret).length < 8 ||
        new TextEncoder().encode(secret).length > 1024 ||
        /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(secret))
    ) {
      setValidation("policy");
      password.current?.focus();
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setFailure(undefined);
    setRetryAfter(undefined);
    setValidation(undefined);
    setAmbiguous(false);
    try {
      const service = await authenticationService();
      if (registration) {
        await service.register(profile.id, name, secret, controller.signal);
        if (!controller.signal.aborted) setSuccess(true);
      } else {
        await service.login(
          profile.id,
          name,
          secret,
          controller.signal,
          search.get("account") ?? undefined,
        );
        if (!controller.signal.aborted) void navigate("/");
      }
    } catch (error) {
      if (active.current !== controller) return;
      const category = sessionError(error);
      setFailure(category);
      if (registration && ["network", "timeout", "cancelled", "malformed"].includes(category))
        setAmbiguous(true);
      if (error instanceof ApiError && error.metadata.retryAfterMs !== undefined)
        setRetryAfter(error.metadata.retryAfterMs);
    } finally {
      if (password.current) password.current.value = "";
      if (confirmation.current) confirmation.current.value = "";
      if (active.current === controller) {
        active.current = null;
        setBusy(false);
      }
    }
  }
  return (
    <div className="flex min-w-0 max-w-lg flex-col gap-5">
      <h1 id="route-heading" tabIndex={-1} className="text-lg font-semibold">
        {t(registration ? "auth.register" : "auth.signIn")}
      </h1>
      {profile && (
        <>
          <p className="break-all">
            {profile.label}: {profile.canonicalUrl}
          </p>
          <p>{t("auth.savedServer")}</p>
          {profile.canonicalUrl.startsWith("http:") && (
            <InlineNotice tone="warning">{t("auth.httpWarning")}</InlineNotice>
          )}
          <InlineNotice tone="warning">
            {t(isTauri() ? "auth.nativeWarning" : "auth.browserWarning")}
          </InlineNotice>
        </>
      )}
      {registration && (
        <>
          <p>{t(policy === "failed" ? "auth.policyFailed" : `auth.${policy}`)}</p>
          {(policy === "failed" || policy === "closed") && (
            <Button onClick={() => setRefresh((n) => n + 1)}>{t("auth.recheck")}</Button>
          )}
        </>
      )}
      {!profile && policy === "failed" && <p>{t("auth.errors.storage")}</p>}
      {success ? (
        <InlineNotice tone="success" announce="polite">
          {t("auth.registered")}
        </InlineNotice>
      ) : (
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <TextField
            ref={username}
            label={t("auth.username")}
            autoComplete="username"
            disabled={busy}
            hint={registration ? t("auth.usernameHint") : undefined}
            error={validation === "username" ? t("auth.requiredUsername") : undefined}
          />
          <TextField
            ref={password}
            label={t("auth.password")}
            type="password"
            autoComplete={registration ? "new-password" : "current-password"}
            disabled={busy}
            hint={registration ? t("auth.passwordHint") : undefined}
            error={
              validation === "password"
                ? t("auth.requiredPassword")
                : validation === "policy"
                  ? t("auth.passwordPolicy")
                  : undefined
            }
          />
          {registration && (
            <TextField
              ref={confirmation}
              label={t("auth.confirmation")}
              type="password"
              autoComplete="new-password"
              disabled={busy}
              error={validation === "confirmation" ? t("auth.confirmationMismatch") : undefined}
            />
          )}
          {failure && (
            <InlineNotice tone="error" announce="polite">
              {t(failure === "cancelled" ? "auth.cancelled" : `auth.errors.${errorKey(failure)}`)}
              {ambiguous && <p>{t("auth.ambiguousRegistration")}</p>}
              {retryAfter !== undefined && (
                <p>{t("auth.retryAfter", { seconds: Math.ceil(retryAfter / 1000) })}</p>
              )}
            </InlineNotice>
          )}
          <div className="flex flex-wrap gap-3">
            <Button
              type="submit"
              variant="primary"
              disabled={
                !profile || busy || (registration && policy !== "open" && policy !== "legacy")
              }
            >
              {t(
                busy
                  ? registration
                    ? "auth.pendingRegister"
                    : "auth.pendingLogin"
                  : registration
                    ? "auth.submitRegister"
                    : "auth.submitLogin",
              )}
            </Button>
            {busy && <Button onClick={() => active.current?.abort()}>{t("auth.cancel")}</Button>}
          </div>
        </form>
      )}
      <Link
        className="underline"
        to={registration ? `/servers/${profileId}/login` : `/servers/${profileId}/register`}
      >
        {t(registration ? "auth.loginLink" : "auth.registerLink")}
      </Link>
      <Link className="underline" to="/">
        {t("navigation.backHome")}
      </Link>
    </div>
  );
}
