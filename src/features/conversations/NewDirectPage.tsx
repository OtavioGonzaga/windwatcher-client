import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Button } from "../../shared/components/Button";
import { TextField } from "../../shared/components/TextField";
import { InlineNotice } from "../../shared/components/InlineNotice";
import { profileRepository } from "../../shared/storage/platform-storage";
import { useSession } from "../authentication/SessionOwner";
import type { AuthenticationService } from "../authentication/service";
import { DirectOperation, directFailure } from "./direct-operation";
import type { DirectFailure } from "./direct-operation";
import { validUsername } from "./direct-validation";
import type { UserSummary } from "./direct-validation";

type Active = NonNullable<ReturnType<AuthenticationService["activeContext"]>>;
type Phase =
  | { kind: "idle" | "looking" | "empty" }
  | { kind: "matched" | "creating"; user: UserSummary }
  | { kind: "error"; failure: DirectFailure; user?: UserSummary; until?: number };

export function NewDirectPage() {
  const { owner, status } = useSession();
  const { t } = useTranslation();
  const active = useMemo(
    () => (status.kind === "ready" ? owner?.activeContext() : null),
    [owner, status],
  );
  if (!owner || !active)
    return (
      <section className="flex flex-col gap-4">
        <h1 id="route-heading" tabIndex={-1}>
          {t("direct.title")}
        </h1>
        <p>{t("conversations.signIn")}</p>
        <Link to="/conversations">{t("conversations.back")}</Link>
      </section>
    );
  return (
    <DirectForm
      key={`${active.profileId}:${active.accountId}:${active.epoch}`}
      owner={owner}
      active={active}
    />
  );
}

function DirectForm({ owner, active }: { owner: AuthenticationService; active: Active }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [server, setServer] = useState("");
  const [serverFailed, setServerFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [now, setNow] = useState(Date.now);
  const [cooldown, setCooldown] = useState(0);
  const operation = useRef<DirectOperation | null>(null);
  const controller = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const busy = useRef(false);
  const field = useRef<HTMLInputElement>(null);
  const notice = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const mounted = { current: true };
    void profileRepository()
      .then((repository) => repository.load())
      .then((state) => {
        const profile = state.serverProfiles.find((item) => item.id === active.profileId);
        if (mounted.current) {
          if (profile)
            setServer(`${profile.label ? `${profile.label} — ` : ""}${profile.canonicalUrl}`);
          setServerFailed(!profile);
        }
      })
      .catch(() => {
        if (mounted.current) setServerFailed(true);
      });
    const lifetime = controller;
    const generation = sequence;
    return () => {
      mounted.current = false;
      generation.current++;
      lifetime.current?.abort();
    };
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- Explicit retry must reload the nonsecret server description.
  }, [active.profileId, loadAttempt]);
  useEffect(() => {
    if (phase.kind === "matched" || phase.kind === "error" || phase.kind === "empty")
      notice.current?.focus();
  }, [phase]);
  useEffect(() => {
    if (cooldown <= now) return undefined;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(cooldown - now, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [cooldown, now]);
  const change = (value: string) => {
    sequence.current++;
    controller.current?.abort();
    operation.current = null;
    busy.current = false;
    setInput(value);
    setPhase({ kind: "idle" });
  };
  const lookup = async () => {
    if (busy.current || cooldown > Date.now()) return;
    if (!validUsername(input)) {
      setPhase({ kind: "error", failure: "username" });
      field.current?.focus();
      return;
    }
    if (!server) {
      setPhase({ kind: "error", failure: "network" });
      return;
    }
    const ticket = ++sequence.current;
    const lifetime = new AbortController();
    controller.current?.abort();
    controller.current = lifetime;
    operation.current = null;
    busy.current = true;
    setPhase({ kind: "looking" });
    try {
      const user = await owner.findUser(active, input, lifetime.signal);
      const current = await owner.isCurrent(active);
      if (!current || lifetime.signal.aborted || ticket !== sequence.current) return;
      setPhase(user ? { kind: "matched", user } : { kind: "empty" });
    } catch (error) {
      if (!lifetime.signal.aborted && ticket === sequence.current) {
        const failure = directFailure(error, false);
        setNow(Date.now());
        setCooldown(failure.until ?? 0);
        setPhase({
          kind: "error",
          failure: failure.kind,
          ...(failure.until === undefined ? {} : { until: failure.until }),
        });
      }
    } finally {
      if (ticket === sequence.current) busy.current = false;
    }
  };
  const create = async (user: UserSummary) => {
    if (busy.current || cooldown > Date.now()) return;
    operation.current ??= new DirectOperation(user);
    const op = operation.current;
    if (!op.eligible()) {
      setPhase({ kind: "error", failure: "expired", user });
      return;
    }
    const ticket = ++sequence.current;
    const lifetime = new AbortController();
    controller.current = lifetime;
    busy.current = true;
    setPhase({ kind: "creating", user });
    try {
      const result = await op.dispatch((id, key) =>
        owner.openDirect(active, id, key, lifetime.signal),
      );
      const current = await owner.isCurrent(active);
      if (current && !lifetime.signal.aborted && ticket === sequence.current) {
        void navigate(`/conversations/${result.id}`);
      }
    } catch (error) {
      if (!lifetime.signal.aborted && ticket === sequence.current) {
        const failure = directFailure(error, true);
        setNow(Date.now());
        setCooldown(failure.until ?? 0);
        if (["conflict", "resultUnavailable", "unavailable"].includes(failure.kind)) op.stop();
        setPhase({
          kind: "error",
          failure: failure.kind,
          user,
          ...(failure.until === undefined ? {} : { until: failure.until }),
        });
      }
    } finally {
      if (ticket === sequence.current) busy.current = false;
    }
  };
  const user = "user" in phase ? phase.user : undefined;
  const waiting = cooldown > now;
  const pending = phase.kind === "looking" || phase.kind === "creating";
  const terminal =
    phase.kind === "error" &&
    ["conflict", "resultUnavailable", "unavailable", "expired"].includes(phase.failure);
  return (
    <section className="flex min-w-0 max-w-lg flex-col gap-4 break-words">
      <h1 id="route-heading" tabIndex={-1} className="text-lg font-semibold">
        {t("direct.title")}
      </h1>
      <Link to="/conversations" className="underline">
        {t("conversations.back")}
      </Link>
      {serverFailed && (
        <InlineNotice tone="warning">
          <p>{t("direct.errors.network")}</p>
          <Button onClick={() => setLoadAttempt((attempt) => attempt + 1)}>
            {t("conversations.retry")}
          </Button>
        </InlineNotice>
      )}
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void lookup();
        }}
      >
        <TextField
          ref={field}
          label={t("direct.username")}
          hint={t("direct.hint")}
          value={input}
          onChange={(event) => change(event.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          disabled={phase.kind === "creating"}
        />
        <Button type="submit" disabled={pending || waiting || !server}>
          {t("direct.find")}
        </Button>
      </form>
      {pending && (
        <output>{t(phase.kind === "looking" ? "direct.looking" : "direct.creating")}</output>
      )}
      <div ref={notice} tabIndex={-1} className="flex flex-col gap-3">
        {phase.kind === "empty" && <InlineNotice>{t("direct.empty")}</InlineNotice>}
        {user && (
          <div className="flex flex-col gap-2">
            <p>{t("direct.confirm", { username: user.username })}</p>
            <p>{server}</p>
            {user.id === active.userId && <p>{t("direct.self")}</p>}
          </div>
        )}
        {phase.kind === "error" && (
          <InlineNotice tone="warning" announce="polite">
            {t(`direct.errors.${phase.failure}`)}
          </InlineNotice>
        )}
        {phase.kind === "matched" && (
          <Button onClick={() => void create(phase.user)}>{t("direct.start")}</Button>
        )}
        {phase.kind === "error" && !terminal && (
          <Button disabled={waiting} onClick={() => void (user ? create(user) : lookup())}>
            {t("conversations.retry")}
          </Button>
        )}
        {user && !pending && (
          <Button
            onClick={() => {
              change(input);
              field.current?.focus();
            }}
          >
            {t("direct.again")}
          </Button>
        )}
      </div>
    </section>
  );
}
