import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ApiError } from "../../shared/api/error";
import { Button } from "../../shared/components/Button";
import { formatDate } from "../../shared/i18n/format";
import { isLocale } from "../../shared/i18n/locale";
import type { AuthenticationService } from "../authentication/service";
import type { Member } from "./group-validation";
import { useCooldown } from "./useCooldown";

type Active = NonNullable<ReturnType<AuthenticationService["activeContext"]>>;
type Failure = "network" | "invalid" | "cursor" | "rate";
export function GroupMembers({
  owner,
  context,
  conversationId,
  onUnavailable,
  disabled = false,
  onRefreshRequest,
  renderActions,
  onObserved,
  onCooldown,
}: {
  owner: Pick<AuthenticationService, "listGroupMembers" | "isCurrent">;
  context: Active;
  conversationId: string;
  onUnavailable: () => void;
  disabled?: boolean;
  onRefreshRequest?: () => void;
  renderActions?: ((member: Member) => ReactNode) | undefined;
  onObserved?: (members: Member[]) => void;
  onCooldown?: (until: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState<Member[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [pending, setPending] = useState(true);
  const [failure, setFailure] = useState<Failure>();
  const [until, setUntil] = useState(0);
  const deadline = useRef(0);
  const { waiting, seconds } = useCooldown(until);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const busy = useRef(false);
  const cursors = useRef(new Set<string>());
  const request = useCallback(
    (next?: string) => {
      if (deadline.current > Date.now() || (next !== undefined && busy.current)) return;
      controller.current?.abort();
      const lifetime = new AbortController();
      controller.current = lifetime;
      const ticket = ++generation.current;
      busy.current = true;
      setPending(true);
      setFailure(undefined);
      if (next === undefined) {
        setItems([]);
        setCursor(null);
        cursors.current.clear();
      }
      void owner
        .listGroupMembers(context, conversationId, next, lifetime.signal)
        .then(async (page) => {
          const current = await owner.isCurrent(context);
          if (!current || lifetime.signal.aborted || ticket !== generation.current) return;
          if (
            (next === undefined && page.items.length === 0) ||
            (page.has_more && page.next_cursor != null && cursors.current.has(page.next_cursor))
          )
            throw new ApiError("invalid-response");
          onObserved?.(page.items);
          if (page.next_cursor != null) cursors.current.add(page.next_cursor);
          setItems((previous) => {
            if (next === undefined) return page.items;
            const seen = new Set(previous.map((m) => m.user.id));
            return [...previous, ...page.items.filter((m) => !seen.has(m.user.id))];
          });
          setCursor(page.has_more ? (page.next_cursor ?? null) : null);
        })
        .catch(async (error: unknown) => {
          const current = await owner.isCurrent(context);
          if (!current || lifetime.signal.aborted || ticket !== generation.current) return;
          if (error instanceof ApiError) {
            if (error.metadata.status === 403 || error.metadata.status === 404) {
              setItems([]);
              setCursor(null);
              onUnavailable();
              return;
            }
            if (
              error.metadata.status === 400 &&
              error.metadata.code === "pagination.invalid_cursor"
            ) {
              setFailure("cursor");
              return;
            }
            if (error.metadata.status === 429) {
              deadline.current = Date.now() + (error.metadata.retryAfterMs ?? 1000);
              setUntil(deadline.current);
              onCooldown?.(deadline.current);
              setFailure("rate");
              return;
            }
            if (error.category === "invalid-response" || error.category === "response-too-large") {
              setFailure("invalid");
              return;
            }
          }
          setFailure("network");
        })
        .finally(() => {
          if (ticket === generation.current) {
            busy.current = false;
            setPending(false);
          }
        });
    },
    [owner, context, conversationId, onUnavailable, onObserved, onCooldown],
  );
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- Begin this scope's independent member fetch.
    request();
    const currentController = controller;
    const currentGeneration = generation;
    return () => {
      currentGeneration.current++;
      currentController.current?.abort();
    };
  }, [request]);
  const language = i18n.resolvedLanguage ?? "";
  const locale = isLocale(language) ? language : "en";
  const restart = failure === "cursor" || failure === "invalid";
  return (
    <section className="flex min-w-0 flex-col gap-3" aria-label={t("groups.members")}>
      <h2 className="font-semibold">{t("groups.members")}</h2>
      {!renderActions && <p>{t("groups.readOnly")}</p>}
      <Button
        disabled={waiting || disabled}
        onClick={() => (onRefreshRequest ? onRefreshRequest() : request())}
      >
        {t("groups.refresh")}
      </Button>
      {pending && <output>{t("conversations.loading")}</output>}
      {failure && (
        <output className="flex flex-col gap-2">
          <p>
            {waiting
              ? t("conversations.rate", { seconds })
              : t(restart ? "groups.invalidMembers" : "groups.memberError")}
          </p>
          <Button
            disabled={waiting || pending || disabled}
            onClick={() => request(restart ? undefined : (cursor ?? undefined))}
          >
            {t(restart ? "groups.restart" : "conversations.retry")}
          </Button>
        </output>
      )}
      <p>{t("groups.partial")}</p>
      <ul className="flex min-w-0 flex-col gap-3">
        {items.map((member) => (
          <li
            key={member.user.id}
            className="min-w-0 break-words rounded-md border border-border p-3"
          >
            <p>{member.user.username}</p>
            <p>{t(`groups.roles.${member.role}`)}</p>
            <p>
              {t("groups.joined", {
                date: formatDate(new Date(member.joined_at), locale, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }),
              })}
            </p>
            {renderActions?.(member)}
          </li>
        ))}
      </ul>
      {cursor && !failure && (
        <Button disabled={pending || waiting || disabled} onClick={() => request(cursor)}>
          {t("groups.more")}
        </Button>
      )}
    </section>
  );
}
