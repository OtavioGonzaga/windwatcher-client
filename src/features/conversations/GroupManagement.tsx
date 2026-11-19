import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Button } from "../../shared/components/Button";
import { TextField } from "../../shared/components/TextField";
import { InlineNotice } from "../../shared/components/InlineNotice";
import { profileRepository } from "../../shared/storage/platform-storage";
import type { AuthenticationService } from "../authentication/service";
import type { Conversation } from "./validation";
import { GroupMembers } from "./GroupMembers";
import { groupTitleIssue } from "./group-validation";
import { validUsername } from "./direct-validation";
import type { UserSummary } from "./direct-validation";
import { directFailure } from "./direct-operation";
import type { DirectFailure } from "./direct-operation";
import { useGroupLifecycle } from "./useGroupLifecycle";
import { lifecycleFailure, soleOwner } from "./group-lifecycle";
import type { GroupAction } from "./group-lifecycle";
import type { Member } from "./group-validation";
import { useCooldown } from "./useCooldown";

type Context = NonNullable<ReturnType<AuthenticationService["activeContext"]>>;
export function GroupManagement({
  owner,
  context,
  group,
  onSummary,
  onUnavailable,
}: {
  owner: AuthenticationService;
  context: Context;
  group: Conversation;
  onSummary: (group: Conversation) => void;
  onUnavailable: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const lifecycle = useGroupLifecycle({
    owner,
    context,
    group,
    onSummary,
    onUnavailable,
    onLeft: () => {
      onUnavailable();
      void navigate("/conversations", { replace: true });
    },
  });
  const { state, cooldown } = lifecycle;
  const [observed, setObserved] = useState<Member[]>([]);
  const cancelIntent = lifecycle.cancel;
  useEffect(() => {
    const action = state.intent?.action;
    if (
      state.phase !== "confirming" ||
      !action ||
      !("target" in action) ||
      !("user" in action.target)
    )
      return;
    const target = action.target;
    const latest = observed.find((member) => member.user.id === target.user.id);
    if (latest && latest.role !== target.role) cancelIntent();
  }, [state, observed, cancelIntent]);
  const [description, setDescription] = useState("");
  const [metadataAttempt, setMetadataAttempt] = useState(0);
  const [metadataError, setMetadataError] = useState(false);
  const [title, setTitle] = useState(group.title);
  const [titleError, setTitleError] = useState<ReturnType<typeof groupTitleIssue>>();
  const [username, setUsername] = useState("");
  const [peer, setPeer] = useState<UserSummary>();
  const [finding, setFinding] = useState(false);
  const [lookupError, setLookupError] = useState<DirectFailure>();
  const [missing, setMissing] = useState(false);
  const [lookupUntil, setLookupUntil] = useState(0);
  const lookupCooldown = useCooldown(lookupUntil);
  const [probing, setProbing] = useState(false);
  const [leaveNotice, setLeaveNotice] = useState<"probeError" | "transferFirst">();
  const probeBusy = useRef(false);
  const probe = useRef<AbortController | null>(null);
  const lookup = useRef<AbortController | null>(null);
  const lookupSequence = useRef(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const notice = useRef<HTMLOutputElement>(null);
  const manager = group.membership.role === "owner" || group.membership.role === "admin";
  const disabled =
    state.phase !== "idle" ||
    !lifecycle.verified ||
    cooldown.waiting ||
    lookupCooldown.waiting ||
    !description ||
    finding ||
    probing ||
    leaveNotice === "probeError";
  useEffect(() => {
    const lifetime = new AbortController();
    void profileRepository()
      .then((repository) => repository.load())
      .then((metadata) => {
        if (lifetime.signal.aborted) return;
        const profile = metadata.serverProfiles.find((p) => p.id === context.profileId);
        const account = metadata.accounts.find((a) => a.id === context.accountId);
        if (!profile || !account) {
          setMetadataError(true);
          return;
        }
        setDescription(`${account.username} — ${profile.label} — ${profile.canonicalUrl}`);
        setMetadataError(false);
      })
      .catch(() => {
        if (!lifetime.signal.aborted) setMetadataError(true);
      });
    return () => lifetime.abort();
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- Explicit retry reloads the nonsecret server/account description.
  }, [context.profileId, context.accountId, metadataAttempt]);
  useEffect(() => {
    if (state.phase === "confirming") dialog.current?.showModal();
    else if (dialog.current?.open) dialog.current.close();
    if (state.phase === "result") notice.current?.focus();
  }, [state]);
  useEffect(() => {
    const current = lookup;
    const sequence = lookupSequence;
    const currentProbe = probe;
    return () => {
      sequence.current++;
      current.current?.abort();
      currentProbe.current?.abort();
    };
  }, []);
  const begin = (action: GroupAction, source = group) => {
    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    lifecycle.begin(action, source);
    setPeer(undefined);
  };
  const prepareLeave = async () => {
    if (disabled || probeBusy.current) return;
    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    probeBusy.current = true;
    setProbing(true);
    setLeaveNotice(undefined);
    const lifetime = new AbortController();
    probe.current = lifetime;
    const current = async () =>
      !lifetime.signal.aborted && (await owner.isCurrent(context)) && !lifetime.signal.aborted;
    try {
      const latest = await owner.getConversation(context, group.id, lifetime.signal);
      if (!(await current())) return;
      if (latest.kind !== "group") {
        onUnavailable();
        return;
      }
      onSummary(latest);
      if (latest.membership.role !== "owner") {
        lifecycle.begin({ kind: "leave", destructive: false }, latest);
        return;
      }
      const members = await owner.probeGroupMembers(context, group.id, lifetime.signal);
      if (!(await current())) return;
      if (soleOwner(latest, context.userId, members))
        lifecycle.begin({ kind: "leave", destructive: true }, latest);
      else if (members.items.length >= 2) setLeaveNotice("transferFirst");
      else setLeaveNotice("probeError");
    } catch (error) {
      if (!(await current())) return;
      const failure = lifecycleFailure(error);
      if (failure.kind === "unavailable") {
        onUnavailable();
        return;
      }
      if (failure.kind === "rate") setLookupUntil(failure.until);
      setLeaveNotice("probeError");
    } finally {
      probeBusy.current = false;
      if (!lifetime.signal.aborted) setProbing(false);
    }
  };
  const cancel = () => {
    lifecycle.cancel();
    trigger.current?.focus();
  };
  const find = async () => {
    if (disabled || lookupUntil > Date.now()) return;
    if (!validUsername(username)) {
      setLookupError("username");
      return;
    }
    lookup.current?.abort();
    const lifetime = new AbortController();
    lookup.current = lifetime;
    const ticket = ++lookupSequence.current;
    setFinding(true);
    setPeer(undefined);
    setLookupError(undefined);
    setMissing(false);
    try {
      const result = await owner.findUser(context, username, lifetime.signal);
      if (
        !(await owner.isCurrent(context)) ||
        lifetime.signal.aborted ||
        ticket !== lookupSequence.current
      )
        return;
      if (result) setPeer(result);
      else setMissing(true);
    } catch (error) {
      if (!lifetime.signal.aborted && ticket === lookupSequence.current) {
        const failure = directFailure(error, false);
        setLookupError(failure.kind);
        setLookupUntil(failure.until ?? 0);
      }
    } finally {
      if (ticket === lookupSequence.current) setFinding(false);
    }
  };
  const action = state.intent?.action;
  const target =
    action && "target" in action
      ? "user" in action.target
        ? action.target.user.username
        : action.target.username
      : undefined;
  const memberActions = (member: Member) => (
    <div className="mt-3 flex flex-wrap gap-2">
      {member.role !== "owner" && (
        <>
          <Button
            disabled={disabled}
            onClick={() =>
              begin({
                kind: "role",
                target: member,
                role: member.role === "admin" ? "member" : "admin",
              })
            }
          >
            {t(member.role === "admin" ? "groupManagement.demote" : "groupManagement.promote", {
              username: member.user.username,
            })}
          </Button>
          {member.user.id !== context.userId && (
            <Button disabled={disabled} onClick={() => begin({ kind: "remove", target: member })}>
              {t("groupManagement.remove", { username: member.user.username })}
            </Button>
          )}
        </>
      )}
      {group.membership.role === "owner" && (
        <Button disabled={disabled} onClick={() => begin({ kind: "transfer", target: member })}>
          {t("groupManagement.transfer", { username: member.user.username })}
        </Button>
      )}
    </div>
  );
  return (
    <section className="flex min-w-0 flex-col gap-4" aria-label={t("groupManagement.title")}>
      <h2 className="font-semibold">{t("groupManagement.title")}</h2>
      <p className="text-sm text-secondary">{description}</p>
      {metadataError && (
        <InlineNotice tone="warning">
          <p>{t("groupManagement.metadataError")}</p>
          <Button onClick={() => setMetadataAttempt((n) => n + 1)}>
            {t("conversations.retry")}
          </Button>
        </InlineNotice>
      )}
      {manager && (
        <>
          <form
            className="flex min-w-0 flex-col gap-3 border-t border-border pt-4"
            onSubmit={(event) => {
              event.preventDefault();
              const issue = groupTitleIssue(title);
              setTitleError(issue);
              if (!issue && !disabled) begin({ kind: "rename", title });
            }}
          >
            <TextField
              label={t("groups.title")}
              value={title}
              disabled={disabled}
              error={titleError ? t(`groups.titleErrors.${titleError}`) : undefined}
              onChange={(event) => {
                setTitle(event.target.value);
                setTitleError(undefined);
              }}
            />
            <p>{t("groups.bytes", { count: new TextEncoder().encode(title).byteLength })}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={disabled}>
                {t("groupManagement.rename")}
              </Button>
              <Button
                disabled={disabled}
                onClick={() => {
                  setTitle(group.title);
                  setTitleError(undefined);
                }}
              >
                {t("discovery.cancel")}
              </Button>
            </div>
          </form>
          <form
            className="flex min-w-0 flex-col gap-3 border-t border-border pt-4"
            onSubmit={(event) => {
              event.preventDefault();
              void find();
            }}
          >
            <TextField
              label={t("direct.username")}
              hint={t("direct.hint")}
              value={username}
              disabled={disabled}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                lookupSequence.current++;
                lookup.current?.abort();
                setFinding(false);
                setUsername(event.target.value);
                setPeer(undefined);
                setLookupError(undefined);
                setMissing(false);
              }}
            />
            <Button type="submit" className="self-start" disabled={disabled}>
              {t("direct.find")}
            </Button>
          </form>
          {finding && <output>{t("direct.looking")}</output>}
          {missing && <output>{t("groups.lookup.missing")}</output>}
          {lookupError && <output>{t(`direct.errors.${lookupError}`)}</output>}
          {peer && (
            <div className="flex flex-wrap items-center gap-2">
              <p>{peer.username}</p>
              <Button disabled={disabled} onClick={() => begin({ kind: "add", target: peer })}>
                {t("groupManagement.add")}
              </Button>
            </div>
          )}
        </>
      )}
      <Button className="self-start" disabled={disabled} onClick={() => void prepareLeave()}>
        {t("groupManagement.leave")}
      </Button>
      {probing && <output>{t("groupManagement.checking")}</output>}
      {leaveNotice && (
        <output>
          <p>{t(`groupManagement.${leaveNotice}`)}</p>
          {leaveNotice === "probeError" && (
            <Button
              disabled={lookupCooldown.waiting || cooldown.waiting}
              onClick={() => {
                setLeaveNotice(undefined);
                void lifecycle.check();
              }}
            >
              {t("groupManagement.check")}
            </Button>
          )}
        </output>
      )}
      <output ref={notice} tabIndex={-1} className="flex flex-col gap-3">
        {(state.phase === "sending" || state.phase === "checking") && (
          <p>{t(`groupManagement.${state.phase}`)}</p>
        )}
        {state.outcome && <p>{t(`groupManagement.outcomes.${state.outcome}`)}</p>}
        {state.failure && <p>{t(`groupManagement.errors.${state.failure}`)}</p>}
        {state.verification && <p>{t(`groupManagement.verification.${state.verification}`)}</p>}
        {cooldown.waiting && <p>{t("conversations.rate", { seconds: cooldown.seconds })}</p>}
      </output>
      {state.phase === "result" && (
        <>
          {state.outcome === "ambiguous" && (
            <Link className="inline-flex min-h-11 items-center underline" to="/conversations">
              {t("groupManagement.abandon")}
            </Link>
          )}
          <Button
            disabled={cooldown.waiting || lookupCooldown.waiting}
            onClick={() => void lifecycle.check()}
          >
            {t("groupManagement.check")}
          </Button>
          {state.verification && state.verification !== "failed" && (
            <Button
              disabled={cooldown.waiting || lookupCooldown.waiting}
              onClick={() => {
                lifecycle.finish();
                setPeer(undefined);
              }}
            >
              {t(
                state.outcome === "ambiguous"
                  ? "groupManagement.acknowledge"
                  : "groupManagement.finish",
              )}
            </Button>
          )}
        </>
      )}
      <GroupMembers
        key={lifecycle.revision}
        owner={owner}
        context={context}
        conversationId={group.id}
        onUnavailable={onUnavailable}
        disabled={disabled}
        onRefreshRequest={() => void lifecycle.check()}
        renderActions={manager ? memberActions : undefined}
        onObserved={setObserved}
        onCooldown={setLookupUntil}
      />
      <dialog
        ref={dialog}
        aria-labelledby="group-action-heading"
        className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-md border border-border bg-surface p-4 text-foreground backdrop:bg-black/60"
        onCancel={(event) => {
          event.preventDefault();
          cancel();
        }}
        onClose={cancel}
      >
        <h2 id="group-action-heading" className="text-lg font-semibold">
          {t("groupManagement.confirm")}
        </h2>
        <div className="my-4 flex min-w-0 flex-col gap-3 break-words">
          <p>{description}</p>
          <p>{state.intent?.sourceTitle}</p>
          {action && <p>{t(`groupManagement.actions.${action.kind}`)}</p>}
          {target && <p>{target}</p>}
          {action?.kind === "rename" && <p className="whitespace-pre-wrap">{action.title}</p>}
          {action?.kind === "role" && <p>{t(`groups.roles.${action.role}`)}</p>}
          {action?.kind === "role" &&
            action.role === "member" &&
            action.target.user.id === context.userId && <p>{t("groupManagement.selfDemotion")}</p>}
          {action?.kind === "transfer" && (
            <p>
              {t(
                action.target.user.id === context.userId
                  ? "groupManagement.selfTransfer"
                  : "groupManagement.transferWarning",
              )}
            </p>
          )}
          {action?.kind === "leave" && (
            <p>
              {t(
                action.destructive
                  ? "groupManagement.deleteWarning"
                  : "groupManagement.leaveWarning",
              )}
            </p>
          )}
          <p className="text-sm text-secondary">{t("groupManagement.transient")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={cancel}>{t("discovery.cancel")}</Button>
          <Button
            variant={
              action?.kind === "leave" || action?.kind === "remove" ? "destructive" : "primary"
            }
            onClick={() => void lifecycle.send()}
          >
            {t(
              action?.kind === "leave" && action.destructive
                ? "groupManagement.delete"
                : "groupManagement.confirm",
            )}
          </Button>
        </div>
      </dialog>
    </section>
  );
}
