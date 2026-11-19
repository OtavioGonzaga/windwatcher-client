import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, Plus, RefreshCw, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Link,
  Navigate,
  NavLink,
  Outlet,
  useLocation,
  useMatch,
  useNavigate,
  useOutletContext,
  useParams,
} from "react-router";
import { ApiError } from "../../shared/api/error";
import { Button } from "../../shared/components/Button";
import { formatDate } from "../../shared/i18n/format";
import { isLocale } from "../../shared/i18n/locale";
import { useSession } from "../authentication/SessionOwner";
import type { AuthenticationService } from "../authentication/service";
import type { Conversation } from "./validation";
import { GroupManagement } from "./GroupManagement";

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
  const detailRoute = useMatch("/conversations/:conversationId");
  const activeId = detailRoute?.params.conversationId;
  const context = useMemo(
    () => (status.kind === "ready" ? owner?.activeContext() : null),
    [owner, status],
  );
  const identity = context ? `${context.profileId}:${context.accountId}` : undefined;
  const [selectionOwner, setSelectionOwner] = useState(identity);
  const changedAccount = identity && selectionOwner && identity !== selectionOwner;
  if (identity && identity !== selectionOwner && (!activeId || !changedAccount))
    setSelectionOwner(identity);
  if (!detail && activeId && changedAccount) return <Navigate replace to="/conversations" />;
  if (!owner || !context)
    return (
      <section className="mx-auto flex w-full max-w-lg flex-col items-start gap-4 px-4 py-8">
        <h1 id="route-heading" tabIndex={-1} className="text-2xl font-semibold">
          {t(detail || activeId ? "conversations.summary" : "conversations.inbox")}
        </h1>
        {status.kind === "signed-out" && (
          <>
            <p>{t("conversations.signIn")}</p>
            <Link to="/" className="action-link">
              {t("auth.signIn")}
            </Link>
          </>
        )}
      </section>
    );
  const key = `${context.profileId}:${context.accountId}:${context.epoch}`;
  return detail ? (
    <Detail key={`${key}:${conversationId}`} owner={owner} context={context} />
  ) : (
    <Workspace key={key} owner={owner} context={context} activeId={activeId} />
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

function Preview({
  conversation,
  compact = false,
}: {
  conversation: Conversation;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const message = conversation.last_message;
  if (!message) return <span>{t("conversations.noMessages")}</span>;
  return (
    <span
      className={compact ? "block truncate" : "block whitespace-pre-wrap [overflow-wrap:anywhere]"}
    >
      <span>{message.sender_username}: </span>
      {message.deleted_at ? t("conversations.deleted") : message.content}
    </span>
  );
}

type WorkspaceContext = {
  previousKey: string | undefined;
  exclude: (id: string) => void;
  updateTitle: (id: string, title: string) => void;
};

function Workspace({ owner, context, activeId }: Scope & { activeId: string | undefined }) {
  const { t } = useTranslation();
  const location = useLocation();
  const current = useRef<string | undefined>(undefined);
  const [previousKey, setPreviousKey] = useState<string>();
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(() => new Set());
  const [titles, setTitles] = useState<ReadonlyMap<string, string>>(() => new Map());
  const exclude = useCallback((id: string) => {
    setExcluded((previous) => (previous.has(id) ? previous : new Set([...previous, id])));
  }, []);
  const updateTitle = useCallback((id: string, title: string) => {
    setTitles((previous) =>
      previous.get(id) === title ? previous : new Map(previous).set(id, title),
    );
  }, []);
  const clearCorrections = useCallback(() => {
    setExcluded(new Set());
    setTitles(new Map());
  }, []);
  useLayoutEffect(() => {
    // Store only the immediately previous entry, never trust a hash entry on its own.
    // oxlint-disable-next-line react/set-state-in-effect -- The ref records the last committed entry.
    setPreviousKey(current.current);
    current.current = location.key;
  }, [location.key]);
  return (
    <div className="grid min-h-0 min-w-0 flex-1 lg:grid-cols-[minmax(17rem,23rem)_minmax(0,1fr)]">
      <div
        className={`conversation-pane min-w-0 bg-surface lg:block lg:border-r lg:border-border ${activeId ? "hidden" : ""}`}
      >
        <Inbox
          owner={owner}
          context={context}
          activeId={activeId}
          excluded={excluded}
          titles={titles}
          clearCorrections={clearCorrections}
        />
      </div>
      <div
        key={activeId ?? "no-selection"}
        className={`conversation-pane min-w-0 ${activeId ? "" : "hidden lg:grid lg:place-items-center"}`}
      >
        {activeId ? (
          <Outlet context={{ previousKey, exclude, updateTitle } satisfies WorkspaceContext} />
        ) : (
          <p className="flex flex-col items-center gap-3 px-6 py-12 text-center text-secondary">
            <MessageCircle aria-hidden="true" size={28} />
            {t("conversations.select")}
          </p>
        )}
      </div>
    </div>
  );
}

function Inbox({
  owner,
  context,
  activeId,
  excluded,
  titles,
  clearCorrections,
}: Scope & {
  activeId: string | undefined;
  excluded: ReadonlySet<string>;
  titles: ReadonlyMap<string, string>;
  clearCorrections: () => void;
}) {
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? "";
  const locale = isLocale(language) ? language : "en";
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
  const visibleItems = items.filter((item) => !excluded.has(item.id));
  return (
    <section className="flex min-w-0 flex-col" aria-labelledby="inbox-heading">
      <div className="flex min-w-0 flex-col gap-3 border-b border-border p-4">
        {activeId ? (
          <h2 id="inbox-heading" className="text-xl font-semibold">
            {t("conversations.inbox")}
          </h2>
        ) : (
          <h1 id="route-heading" tabIndex={-1} className="text-xl font-semibold">
            <span id="inbox-heading">{t("conversations.inbox")}</span>
          </h1>
        )}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <details className="min-w-0">
            <summary className="action-link cursor-pointer list-none gap-2">
              <Plus aria-hidden="true" size={18} className="shrink-0" />
              {t("conversations.new")}
            </summary>
            <div className="flex flex-col items-start">
              <Link className="inline-flex min-h-11 items-center underline" to="/conversations/new">
                {t("direct.title")}
              </Link>
              <Link
                className="inline-flex min-h-11 items-center underline"
                to="/conversations/groups/new"
              >
                {t("groups.new")}
              </Link>
            </div>
          </details>
          <Button
            aria-label={t("conversations.refresh")}
            title={t("conversations.refresh")}
            className="px-2"
            disabled={error?.kind === "rate"}
            onClick={() => {
              clearCorrections();
              request();
            }}
          >
            <RefreshCw aria-hidden="true" size={18} />
          </Button>
        </div>
      </div>
      <output className="block px-4 text-sm text-secondary not-empty:py-3">
        {pending
          ? t("conversations.loading")
          : loaded && visibleItems.length === 0 && !cursor
            ? t("conversations.empty")
            : ""}
      </output>
      {error && (
        <div className="p-4">
          <FailureNotice
            value={error}
            retry={() =>
              request(error.kind === "cursor" || !loaded ? undefined : (cursor ?? undefined))
            }
          />
        </div>
      )}
      <ul className="min-w-0" aria-label={t("conversations.inbox")}>
        {visibleItems.map((item) => (
          <li
            key={item.id}
            className="conversation-row relative grid min-h-16 min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 border-b border-s-4 border-border border-s-transparent px-3 py-2 hover:bg-subtle-hover"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-background text-secondary">
              {item.kind === "group" ? (
                <Users aria-hidden="true" size={18} />
              ) : (
                <MessageCircle aria-hidden="true" size={18} />
              )}
            </span>
            <span className="min-w-0">
              <span className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2">
                <NavLink
                  id={`conversation-${item.id}`}
                  aria-describedby={
                    item.last_message
                      ? `conversation-preview-${item.id} conversation-time-${item.id}`
                      : `conversation-preview-${item.id}`
                  }
                  className="min-w-0 font-semibold"
                  to={`/conversations/${item.id}`}
                  state={{ inboxKey: activeId ? undefined : location.key }}
                >
                  <span className="block truncate">{titles.get(item.id) ?? item.title}</span>
                </NavLink>
                {item.last_message && (
                  <time
                    id={`conversation-time-${item.id}`}
                    className="text-xs text-secondary"
                    dateTime={item.last_message.created_at}
                  >
                    {formatDate(new Date(item.last_message.created_at), locale, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </time>
                )}
              </span>
              <span
                id={`conversation-preview-${item.id}`}
                className="flex min-w-0 items-center justify-between gap-2 text-sm text-secondary"
              >
                <span className="min-w-0 truncate">
                  <Preview conversation={item} compact />
                </span>
                {item.unread_count > 0 && (
                  <span className="shrink-0 rounded-full bg-action px-2 text-xs font-semibold text-on-action">
                    <span className="sr-only">
                      {t("conversations.unread", { count: item.unread_count })}
                    </span>
                    <span aria-hidden="true">
                      {item.unread_count > 99 ? "99+" : item.unread_count}
                    </span>
                  </span>
                )}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {cursor && !error && (
        <div className="p-4">
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
  const location = useLocation();
  const navigate = useNavigate();
  const workspace = useOutletContext<WorkspaceContext | null>();
  const exclude = workspace?.exclude;
  const updateTitle = workspace?.updateTitle;
  const [item, setItem] = useState<Conversation>();
  const [error, setError] = useState<Failure>();
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState(true);
  const reconcileSummary = useCallback(
    (summary: Conversation) => {
      updateTitle?.(summary.id, summary.title);
      setItem(summary);
    },
    [updateTitle],
  );
  const unavailable = useCallback(() => {
    exclude?.(conversationId);
    setItem(undefined);
    setError({ kind: "unavailable" });
  }, [conversationId, exclude]);
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
        if (lifetime.signal.aborted) return;
        const reason = failure(cause, true);
        if (reason.kind === "unavailable") unavailable();
        else setError(reason);
      })
      .finally(() => {
        if (!lifetime.signal.aborted) setPending(false);
      });
    return () => lifetime.abort();
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- attempt intentionally starts an explicit retry.
  }, [owner, context, conversationId, attempt, unavailable]);
  const language = i18n.resolvedLanguage ?? "";
  const locale = isLocale(language) ? language : "en";
  return (
    <section className="min-w-0 [overflow-wrap:anywhere]">
      <header className="flex flex-col items-start border-b border-border bg-surface px-4 pt-2 pb-4 sm:px-6">
        <Link
          className="inline-flex min-h-11 items-center text-sm underline"
          to="/conversations"
          onClick={(event) => {
            if (
              event.button === 0 &&
              !event.metaKey &&
              !event.ctrlKey &&
              !event.shiftKey &&
              !event.altKey &&
              workspace?.previousKey &&
              location.state?.inboxKey === workspace.previousKey
            ) {
              event.preventDefault();
              void navigate(-1);
            }
          }}
        >
          {t("conversations.back")}
        </Link>
        <h1 id="route-heading" tabIndex={-1} className="text-2xl font-semibold">
          {item?.title ?? t("conversations.summary")}
        </h1>
        {item && <p className="text-sm text-secondary">{t(`conversations.${item.kind}`)}</p>}
      </header>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-4 sm:p-6">
        {pending && <output className="text-secondary">{t("conversations.loading")}</output>}
        {error && <FailureNotice value={error} retry={() => setAttempt((n) => n + 1)} />}
        {item && (
          <>
            <section className="flex flex-col gap-2 rounded-md border border-border bg-surface p-4">
              <h2 className="font-semibold">{t("conversations.lastMessage")}</h2>
              <Preview conversation={item} />
              {item.last_message && (
                <time className="text-sm text-secondary" dateTime={item.last_message.created_at}>
                  {formatDate(new Date(item.last_message.created_at), locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </time>
              )}
            </section>
            <p className="text-sm text-secondary">{t("conversations.notice")}</p>
            {item.kind === "group" && (
              <details className="rounded-md border border-border bg-surface">
                <summary className="min-h-11 cursor-pointer p-3 font-semibold">
                  {t("groups.info")}
                </summary>
                <div className="flex flex-col gap-4 border-t border-border p-4">
                  <p className="text-sm text-secondary">
                    {t("conversations.role")}: {t(`conversations.${item.membership.role}`)}
                  </p>
                  <GroupManagement
                    owner={owner}
                    context={context}
                    group={item}
                    onSummary={reconcileSummary}
                    onUnavailable={unavailable}
                  />
                </div>
              </details>
            )}
          </>
        )}
      </div>
    </section>
  );
}
