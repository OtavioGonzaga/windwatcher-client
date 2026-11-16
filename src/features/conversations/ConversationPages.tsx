import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";
import { ApiError } from "../../shared/api/error";
import { Button } from "../../shared/components/Button";
import { formatDate } from "../../shared/i18n/format";
import { isLocale } from "../../shared/i18n/locale";
import { useSession } from "../authentication/SessionOwner";
import type { AuthenticationService } from "../authentication/service";
import type { Conversation } from "./validation";

type Context = NonNullable<ReturnType<AuthenticationService["activeContext"]>>;
type Scope = { owner: AuthenticationService; context: Context };
type Failure = {
  kind: "error" | "invalid" | "cursor" | "unavailable" | "rate" | "timeout";
  until?: number;
};

function failure(error: unknown, detail = false): Failure {
  if (error instanceof ApiError) {
    if (detail && (error.metadata.status === 403 || error.metadata.status === 404))
      return { kind: "unavailable" };
    if (error.metadata.code === "pagination.invalid_cursor" && error.metadata.status === 400)
      return { kind: "cursor" };
    if (error.metadata.status === 429)
      return { kind: "rate", until: Date.now() + (error.metadata.retryAfterMs ?? 1000) };
    if (error.category === "timeout") return { kind: "timeout" };
    if (error.category === "invalid-response" || error.category === "response-too-large")
      return { kind: "invalid" };
  }
  return { kind: "error" };
}

function Gate({ detail }: { detail?: boolean }) {
  const { owner, status } = useSession();
  const { conversationId = "" } = useParams();
  const { t } = useTranslation();
  const context = useMemo(
    () => (status.kind === "ready" ? owner?.activeContext() : null),
    [owner, status],
  );
  if (!owner || !context)
    return (
      <section>
        <h1 id="route-heading" tabIndex={-1}>
          {t(detail ? "conversations.summary" : "conversations.inbox")}
        </h1>
        <p>{status.kind === "restoring" ? t("auth.restoring") : t("conversations.signIn")}</p>
      </section>
    );
  const key = `${context.profileId}:${context.accountId}:${context.epoch}`;
  return detail ? (
    <Detail key={`${key}:${conversationId}`} owner={owner} context={context} />
  ) : (
    <Inbox key={key} owner={owner} context={context} />
  );
}

export function InboxPage() {
  return <Gate />;
}
export function ConversationDetailPage() {
  return <Gate detail />;
}

function FailureNotice({ value, retry }: { value: Failure; retry: () => void }) {
  const { t } = useTranslation();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!value.until || value.until <= now) return undefined;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(value.until - now, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [value.until, now]);
  const waiting = value.until !== undefined && value.until > now;
  return (
    <div className="flex flex-col items-start gap-2 break-words">
      <output>
        <p>
          {value.kind === "rate" && waiting
            ? t("conversations.rate", { seconds: Math.ceil((value.until! - now) / 1000) })
            : t(`conversations.${value.kind === "rate" ? "error" : value.kind}`)}
        </p>
      </output>
      {value.kind !== "unavailable" && (
        <Button disabled={waiting} onClick={retry}>
          {t(value.kind === "cursor" ? "conversations.restart" : "conversations.retry")}
        </Button>
      )}
    </div>
  );
}

function Preview({ conversation }: { conversation: Conversation }) {
  const { t } = useTranslation();
  const message = conversation.last_message;
  if (!message) return <p>{t("conversations.noMessages")}</p>;
  return (
    <p className="min-w-0 break-words">
      <span>{message.sender_username}: </span>
      <span className="line-clamp-3 whitespace-pre-wrap">
        {message.deleted_at ? t("conversations.deleted") : message.content}
      </span>
    </p>
  );
}

function Inbox({ owner, context }: Scope) {
  const { t } = useTranslation();
  const [items, setItems] = useState<Conversation[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<Failure>();
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const request = useCallback(
    (next?: string) => {
      if (next && busy.current) return;
      controller.current?.abort();
      const lifetime = new AbortController();
      controller.current = lifetime;
      const current = ++generation.current;
      busy.current = true;
      setPending(true);
      setError(undefined);
      if (!next) {
        setItems([]);
        setCursor(null);
        setLoaded(false);
      }
      void owner
        .listConversations(context, next, lifetime.signal)
        .then(async (page) => {
          if (
            lifetime.signal.aborted ||
            current !== generation.current ||
            !(await owner.isCurrent(context)) ||
            lifetime.signal.aborted ||
            current !== generation.current
          )
            return;
          setItems((previous) => {
            if (!next) return page.items;
            const seen = new Set(previous.map((item) => item.id));
            return [...previous, ...page.items.filter((item) => !seen.has(item.id))];
          });
          setCursor(page.has_more ? (page.next_cursor ?? null) : null);
          setLoaded(true);
        })
        .catch((cause: unknown) => {
          if (!lifetime.signal.aborted && current === generation.current) setError(failure(cause));
        })
        .finally(() => {
          if (current === generation.current) {
            busy.current = false;
            setPending(false);
          }
        });
    },
    [owner, context],
  );
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- Starting the route-scoped request updates its loading state.
    request();
    const activeGeneration = generation;
    const activeController = controller;
    const activeBusy = busy;
    return () => {
      activeGeneration.current++;
      activeController.current?.abort();
      activeBusy.current = false;
    };
  }, [request]);
  return (
    <section className="flex min-w-0 flex-col gap-4">
      <h1 id="route-heading" tabIndex={-1} className="text-lg font-semibold">
        {t("conversations.inbox")}
      </h1>
      <div>
        <Button disabled={error?.kind === "rate"} onClick={() => request()}>
          {t("conversations.refresh")}
        </Button>
      </div>
      <output>
        {pending
          ? t("conversations.loading")
          : loaded && items.length === 0
            ? t("conversations.empty")
            : ""}
      </output>
      {error && (
        <FailureNotice
          value={error}
          retry={() =>
            request(error.kind === "cursor" || !loaded ? undefined : (cursor ?? undefined))
          }
        />
      )}
      <ul className="flex min-w-0 flex-col gap-3">
        {items.map((item) => (
          <li key={item.id} className="min-w-0 rounded-md border border-border p-4">
            <Link
              id={`conversation-${item.id}`}
              className="block min-h-11 break-words font-semibold underline"
              to={`/conversations/${item.id}`}
            >
              {item.title}
            </Link>
            <p>
              {t(`conversations.${item.kind}`)} · {t("conversations.role")}:{" "}
              {t(`conversations.${item.membership.role}`)}
            </p>
            <p>{t("conversations.unread", { count: item.unread_count })}</p>
            <Preview conversation={item} />
          </li>
        ))}
      </ul>
      {cursor && !error && (
        <div>
          <Button disabled={pending} onClick={() => request(cursor)}>
            {t("conversations.more")}
          </Button>
        </div>
      )}
    </section>
  );
}

function Detail({ owner, context }: Scope) {
  const { conversationId = "" } = useParams();
  const { t, i18n } = useTranslation();
  const [item, setItem] = useState<Conversation>();
  const [error, setError] = useState<Failure>();
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState(true);
  useEffect(() => {
    const lifetime = new AbortController();
    // oxlint-disable-next-line react/set-state-in-effect -- Every explicit retry starts a fresh authoritative detail fetch.
    setItem(undefined);
    setError(undefined);
    setPending(true);
    void owner
      .getConversation(context, conversationId, lifetime.signal)
      .then(async (result) => {
        if (
          !lifetime.signal.aborted &&
          (await owner.isCurrent(context)) &&
          !lifetime.signal.aborted
        )
          setItem(result);
      })
      .catch((cause: unknown) => {
        if (!lifetime.signal.aborted) setError(failure(cause, true));
      })
      .finally(() => {
        if (!lifetime.signal.aborted) setPending(false);
      });
    return () => lifetime.abort();
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- attempt intentionally starts an explicit retry.
  }, [owner, context, conversationId, attempt]);
  const language = i18n.resolvedLanguage ?? "";
  const locale = isLocale(language) ? language : "en";
  return (
    <section className="flex min-w-0 flex-col gap-4 break-words">
      <h1 id="route-heading" tabIndex={-1} className="text-lg font-semibold">
        {t("conversations.summary")}
      </h1>
      <Link className="underline" to="/conversations">
        {t("conversations.back")}
      </Link>
      {pending && <output>{t("conversations.loading")}</output>}
      {error && <FailureNotice value={error} retry={() => setAttempt((n) => n + 1)} />}
      {item && (
        <>
          <h2 className="text-lg font-semibold">{item.title}</h2>
          <p>
            {t(`conversations.${item.kind}`)} · {t("conversations.role")}:{" "}
            {t(`conversations.${item.membership.role}`)}
          </p>
          <p>{t("conversations.unread", { count: item.unread_count })}</p>
          <p>
            {t("conversations.created")}:{" "}
            {formatDate(new Date(item.created_at), locale, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
          <p>
            {t("conversations.updated")}:{" "}
            {formatDate(new Date(item.updated_at), locale, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
          {item.membership.last_read_message_id && (
            <p>
              {t("conversations.lastRead")}: {item.membership.last_read_message_id}
            </p>
          )}
          <h3 className="font-semibold">{t("conversations.lastMessage")}</h3>
          <Preview conversation={item} />
          <p>{t("conversations.notice")}</p>
        </>
      )}
    </section>
  );
}
