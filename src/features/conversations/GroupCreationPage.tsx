import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Button } from "../../shared/components/Button";
import { TextField } from "../../shared/components/TextField";
import { InlineNotice } from "../../shared/components/InlineNotice";
import { profileRepository } from "../../shared/storage/platform-storage";
import { useSession } from "../authentication/SessionOwner";
import type { AuthenticationService } from "../authentication/service";
import { validUsername } from "./direct-validation";
import type { UserSummary } from "./direct-validation";
import { directFailure } from "./direct-operation";
import type { DirectFailure } from "./direct-operation";
import { groupDraft, groupTitleIssue } from "./group-validation";
import type { TitleIssue } from "./group-validation";
import { GroupOperation } from "./group-operation";
import { groupFailure } from "./group-failure";
import type { GroupFailure } from "./group-failure";
import { useCooldown } from "./useCooldown";

type Active = NonNullable<ReturnType<AuthenticationService["activeContext"]>>;
type Phase =
  | { kind: "draft" | "review" | "sending" }
  | { kind: "failure"; failure: GroupFailure; terminal: boolean };
type Lookup = "idle" | "loading" | "missing" | "owner" | "added" | "duplicate" | "limit";

export function GroupCreationPage() {
  const { owner, status } = useSession();
  const { t } = useTranslation();
  const active = useMemo(
    () => (status.kind === "ready" ? owner?.activeContext() : null),
    [owner, status],
  );
  if (!owner || !active)
    return (
      <section>
        <h1 id="route-heading" tabIndex={-1}>
          {t("groups.new")}
        </h1>
        <p>{t("conversations.signIn")}</p>
        <Link to="/conversations">{t("conversations.back")}</Link>
      </section>
    );
  return (
    <GroupForm
      key={`${active.profileId}:${active.accountId}:${active.epoch}`}
      owner={owner}
      active={active}
      ownerName={status.kind === "ready" ? status.username : ""}
    />
  );
}

function GroupForm({
  owner,
  active,
  ownerName,
}: {
  owner: AuthenticationService;
  active: Active;
  ownerName: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [titleError, setTitleError] = useState<TitleIssue>();
  const [username, setUsername] = useState("");
  const [members, setMembers] = useState<UserSummary[]>([]);
  const [lookup, setLookup] = useState<Lookup>("idle");
  const [lookupError, setLookupError] = useState<DirectFailure>();
  const [phase, setPhase] = useState<Phase>({ kind: "draft" });
  const [uncertain, setUncertain] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [server, setServer] = useState("");
  const [serverFailed, setServerFailed] = useState(false);
  const [serverAttempt, setServerAttempt] = useState(0);
  const [until, setUntil] = useState(0);
  const { waiting, seconds } = useCooldown(until);
  const [operation, setOperation] = useState<GroupOperation | null>(null);
  const [rejected, setRejected] = useState<GroupOperation | null>(null);
  const [unchanged, setUnchanged] = useState(false);
  const lookupController = useRef<AbortController | null>(null);
  const postController = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const sending = useRef(false);
  const finding = useRef(false);
  const notice = useRef<HTMLDivElement>(null);
  const titleField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const lifetime = new AbortController();
    void profileRepository()
      .then((repository) => repository.load())
      .then((state) => {
        if (lifetime.signal.aborted) return;
        const profile = state.serverProfiles.find((p) => p.id === active.profileId);
        if (profile)
          setServer(`${profile.label ? `${profile.label} — ` : ""}${profile.canonicalUrl}`);
        setServerFailed(!profile);
      })
      .catch(() => {
        if (!lifetime.signal.aborted) setServerFailed(true);
      });
    return () => lifetime.abort();
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- Explicit retry reloads the server's nonsecret description.
  }, [active.profileId, serverAttempt]);
  useEffect(() => {
    const currentLookup = lookupController;
    const currentPost = postController;
    const currentGeneration = generation;
    return () => {
      currentGeneration.current++;
      currentLookup.current?.abort();
      currentPost.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (phase.kind !== "draft" || lookup !== "idle" || lookupError) notice.current?.focus();
  }, [phase, lookup, lookupError]);

  const invalidateLookup = () => {
    generation.current++;
    lookupController.current?.abort();
    finding.current = false;
    setLookup("idle");
    setLookupError(undefined);
  };
  const find = async () => {
    if (phase.kind !== "draft" || finding.current || until > Date.now() || !server) return;
    if (!validUsername(username)) {
      setLookupError("username");
      return;
    }
    invalidateLookup();
    const ticket = ++generation.current;
    const lifetime = new AbortController();
    lookupController.current = lifetime;
    finding.current = true;
    setLookup("loading");
    try {
      const user = await owner.findUser(active, username, lifetime.signal);
      const current = await owner.isCurrent(active);
      if (!current || lifetime.signal.aborted || ticket !== generation.current) return;
      if (!user) setLookup("missing");
      else if (user.id === active.userId) setLookup("owner");
      else if (members.some((m) => m.id === user.id)) setLookup("duplicate");
      else if (members.length >= 256) setLookup("limit");
      else {
        setMembers((previous) => [...previous, user]);
        setLookup("added");
      }
    } catch (error) {
      if (!lifetime.signal.aborted && ticket === generation.current) {
        const failure = directFailure(error, false);
        setLookupError(failure.kind);
        setUntil(failure.until ?? 0);
        setLookup("idle");
      }
    } finally {
      if (ticket === generation.current) finding.current = false;
    }
  };
  const review = () => {
    if (phase.kind !== "draft" || finding.current || !server) return;
    const issue = groupTitleIssue(title);
    setTitleError(issue);
    if (issue) {
      titleField.current?.focus();
      return;
    }
    const draft = groupDraft(
      title,
      members.map((m) => m.id),
      active.userId,
    );
    if (
      rejected &&
      rejected.title === draft.title &&
      JSON.stringify(rejected.participantIds) === JSON.stringify(draft.participant_ids)
    ) {
      setUnchanged(true);
      return;
    }
    setUnchanged(false);
    invalidateLookup();
    setOperation(
      new GroupOperation(
        active,
        title,
        members.map((m) => m.id),
      ),
    );
    setPhase({ kind: "review" });
  };
  const send = async () => {
    const op = operation;
    if (
      !op ||
      sending.current ||
      until > Date.now() ||
      (phase.kind !== "review" && (phase.kind !== "failure" || phase.terminal))
    )
      return;
    sending.current = true;
    setPhase({ kind: "sending" });
    const lifetime = new AbortController();
    postController.current = lifetime;
    try {
      const result = await owner.createGroup(active, op, lifetime.signal);
      if (!lifetime.signal.aborted && (await owner.isCurrent(active)) && !lifetime.signal.aborted)
        void navigate(`/conversations/${result.id}`);
    } catch (error) {
      if (!lifetime.signal.aborted && (await owner.isCurrent(active)) && !lifetime.signal.aborted) {
        const failure = groupFailure(error);
        if (failure.terminal) op.stop();
        if (["invalidTitle", "tooMany", "participant"].includes(failure.kind)) setRejected(op);
        if (
          failure.kind === "ambiguous" ||
          failure.kind === "resultUnavailable" ||
          failure.kind === "conflict"
        )
          setUncertain(true);
        setUntil(failure.until ?? 0);
        setPhase({ kind: "failure", failure: failure.kind, terminal: failure.terminal });
      }
    } finally {
      sending.current = false;
    }
  };
  const edit = () => {
    if (sending.current) return;
    if (uncertain && !discard) {
      setDiscard(true);
      return;
    }
    operation?.stop();
    setOperation(null);
    setUncertain(false);
    setDiscard(false);
    setPhase({ kind: "draft" });
    titleField.current?.focus();
  };
  const locked = phase.kind !== "draft";
  const op = operation;
  return (
    <section className="flex min-w-0 max-w-lg flex-col gap-4 break-words">
      <h1 id="route-heading" tabIndex={-1} className="text-lg font-semibold">
        {t("groups.new")}
      </h1>
      <Link to="/conversations" className="underline">
        {t("conversations.back")}
      </Link>
      <p>{t("groups.transient")}</p>
      {serverFailed && (
        <InlineNotice tone="warning">
          <p>{t("direct.errors.network")}</p>
          <Button onClick={() => setServerAttempt((n) => n + 1)}>{t("conversations.retry")}</Button>
        </InlineNotice>
      )}
      <TextField
        ref={titleField}
        label={t("groups.title")}
        value={title}
        disabled={locked}
        error={titleError ? t(`groups.titleErrors.${titleError}`) : undefined}
        onChange={(event) => {
          setTitle(event.target.value);
          setTitleError(undefined);
        }}
      />
      <p>{t("groups.bytes", { count: new TextEncoder().encode(title).byteLength })}</p>
      <form
        className="flex min-w-0 flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void find();
        }}
      >
        <TextField
          label={t("direct.username")}
          hint={t("direct.hint")}
          value={username}
          disabled={locked}
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            invalidateLookup();
            setUsername(event.target.value);
          }}
        />
        <Button type="submit" disabled={locked || lookup === "loading" || waiting || !server}>
          {t("groups.find")}
        </Button>
      </form>
      {!locked && (
        <>
          <h2 className="font-semibold">{t("groups.participants", { count: members.length })}</h2>
          {!members.length && <p>{t("groups.ownerOnly")}</p>}
          <ul className="flex min-w-0 flex-col gap-2">
            {members.map((member) => (
              <li
                key={member.id}
                className="flex min-w-0 flex-wrap items-center justify-between gap-2"
              >
                <span>{member.username}</span>
                <Button
                  onClick={() => {
                    invalidateLookup();
                    setMembers((items) => items.filter((m) => m.id !== member.id));
                  }}
                  aria-label={t("groups.remove", { username: member.username })}
                >
                  {t("groups.remove", { username: member.username })}
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
      <div ref={notice} tabIndex={-1} className="flex min-w-0 flex-col gap-3">
        {unchanged && <InlineNotice tone="warning">{t("groups.changedDraft")}</InlineNotice>}
        {lookup !== "idle" && (
          <output>
            {lookup === "loading" ? t("direct.looking") : t(`groups.lookup.${lookup}`)}
          </output>
        )}
        {lookupError && (
          <InlineNotice tone="warning">{t(`direct.errors.${lookupError}`)}</InlineNotice>
        )}
        {waiting && <output>{t("conversations.rate", { seconds })}</output>}
        {!locked && (
          <Button disabled={lookup === "loading" || waiting || !server} onClick={review}>
            {t("groups.review")}
          </Button>
        )}
        {locked && op && (
          <div className="flex min-w-0 flex-col gap-2">
            <h2 className="font-semibold">{t("groups.review")}</h2>
            <p>{server}</p>
            <p>{t("groups.owner", { username: ownerName })}</p>
            <p className="whitespace-pre-wrap">{op.title}</p>
            <h3 id="review-participants" className="font-medium">
              {t("groups.participants", { count: op.participantIds.length })}
            </h3>
            {op.participantIds.length === 0 ? (
              <p>{t("groups.ownerOnly")}</p>
            ) : (
              <ul aria-labelledby="review-participants" className="flex min-w-0 flex-col gap-2">
                {members
                  .filter((member) => op.participantIds.includes(member.id))
                  .map((member) => (
                    <li key={member.id}>{member.username}</li>
                  ))}
              </ul>
            )}
          </div>
        )}
        {phase.kind === "review" && (
          <Button disabled={waiting} onClick={() => void send()}>
            {t("groups.create")}
          </Button>
        )}
        {phase.kind === "sending" && <output>{t("groups.sending")}</output>}
        {phase.kind === "failure" && (
          <InlineNotice tone="warning">{t(`groups.errors.${phase.failure}`)}</InlineNotice>
        )}
        {uncertain && <InlineNotice tone="warning">{t("groups.uncertain")}</InlineNotice>}
        {phase.kind === "failure" && !phase.terminal && (
          <Button disabled={waiting || discard} onClick={() => void send()}>
            {t("groups.retry")}
          </Button>
        )}
        {locked && phase.kind !== "sending" && !discard && (
          <Button onClick={edit}>{t(uncertain ? "groups.discard" : "groups.edit")}</Button>
        )}
        {discard && (
          <InlineNotice tone="warning">
            <p>{t("groups.discardWarning")}</p>
            <Button onClick={edit}>{t("groups.confirmDiscard")}</Button>
            <Button onClick={() => setDiscard(false)}>{t("groups.keep")}</Button>
          </InlineNotice>
        )}
      </div>
    </section>
  );
}
