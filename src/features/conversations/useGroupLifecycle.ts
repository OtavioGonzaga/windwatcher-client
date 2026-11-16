import { useEffect, useRef, useState } from "react";
import type { AuthenticationService } from "../authentication/service";
import type { Conversation } from "./validation";
import { groupIntent, lifecycleFailure, reconcileGroup } from "./group-lifecycle";
import type { GroupAction, GroupIntent, LifecycleFailure, Reconciliation } from "./group-lifecycle";
import { useCooldown } from "./useCooldown";

type Context = NonNullable<ReturnType<AuthenticationService["activeContext"]>>;
export type LifecycleOwner = Pick<
  AuthenticationService,
  | "getConversation"
  | "listGroupMembers"
  | "isCurrent"
  | "renameGroup"
  | "addGroupMember"
  | "changeGroupMemberRole"
  | "removeGroupMember"
  | "transferGroupOwner"
  | "leaveGroup"
>;
export type LifecycleState = {
  phase: "idle" | "confirming" | "sending" | "checking" | "result";
  intent?: GroupIntent;
  outcome?: "confirmed" | "rejected" | "ambiguous";
  failure?: LifecycleFailure;
  verification?: Reconciliation | "failed";
};
export function useGroupLifecycle({
  owner,
  context,
  group,
  onSummary,
  onUnavailable,
  onLeft,
}: {
  owner: LifecycleOwner;
  context: Context;
  group: Conversation;
  onSummary: (group: Conversation) => void;
  onUnavailable: () => void;
  onLeft: () => void;
}) {
  const [state, setState] = useState<LifecycleState>({ phase: "idle" });
  const [revision, setRevision] = useState(0);
  const [until, setUntil] = useState(0);
  const [verified, setVerified] = useState(true);
  const cooldown = useCooldown(until);
  const deadline = useRef(0);
  const busy = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    const current = controller;
    const sequence = generation;
    return () => {
      sequence.current++;
      current.current?.abort();
    };
  }, []);
  const current = async (ticket: number, signal: AbortSignal) =>
    !signal.aborted &&
    ticket === generation.current &&
    (await owner.isCurrent(context)) &&
    !signal.aborted &&
    ticket === generation.current;

  const check = async (previous = state) => {
    if (busy.current || deadline.current > Date.now()) return;
    busy.current = true;
    setVerified(false);
    setState({ ...previous, phase: "checking" });
    controller.current?.abort();
    const lifetime = new AbortController();
    controller.current = lifetime;
    const ticket = ++generation.current;
    const timer = setTimeout(() => lifetime.abort(), 30000);
    try {
      const snapshot = await reconcileGroup(
        owner,
        context,
        previous.intent ?? groupIntent(context, group, { kind: "rename", title: group.title }),
        lifetime.signal,
      );
      if (!(await current(ticket, lifetime.signal))) return;
      if (snapshot.result === "noAccess") {
        // No access proves neither physical deletion nor the cause of membership loss.
        onUnavailable();
        return;
      }
      if (snapshot.group) onSummary(snapshot.group);
      setRevision((n) => n + 1);
      setVerified(true);
      setState(
        previous.intent
          ? { ...previous, phase: "result", verification: snapshot.result }
          : { phase: "idle" },
      );
    } catch (error) {
      if (ticket !== generation.current || !(await owner.isCurrent(context))) return;
      const failure = lifecycleFailure(error);
      if (failure.kind === "rate") {
        deadline.current = failure.until;
        setUntil(failure.until);
      }
      setState({ ...previous, phase: "result", verification: "failed" });
    } finally {
      clearTimeout(timer);
      if (ticket === generation.current) busy.current = false;
    }
  };
  const begin = (action: GroupAction) => {
    if (busy.current || !verified || deadline.current > Date.now() || state.phase !== "idle")
      return;
    setState({ phase: "confirming", intent: groupIntent(context, group, action) });
  };
  const cancel = () => {
    if (state.phase === "confirming") setState({ phase: "idle" });
  };
  const send = async () => {
    if (
      busy.current ||
      state.phase !== "confirming" ||
      !state.intent ||
      deadline.current > Date.now()
    )
      return;
    const intent = state.intent;
    if (intent.sourceRole !== group.membership.role) {
      setState({ phase: "idle" });
      return;
    }
    busy.current = true;
    setVerified(false);
    setState({ ...state, phase: "sending" });
    controller.current?.abort();
    const lifetime = new AbortController();
    controller.current = lifetime;
    const ticket = ++generation.current;
    let next: LifecycleState;
    try {
      const action = intent.action;
      switch (action.kind) {
        case "rename":
          await owner.renameGroup(context, group.id, action.title, lifetime.signal);
          break;
        case "add":
          await owner.addGroupMember(context, group.id, action.target.id, lifetime.signal);
          break;
        case "role":
          await owner.changeGroupMemberRole(
            context,
            group.id,
            action.target.user.id,
            action.role,
            lifetime.signal,
          );
          break;
        case "remove":
          await owner.removeGroupMember(context, group.id, action.target.user.id, lifetime.signal);
          break;
        case "transfer":
          await owner.transferGroupOwner(context, group.id, action.target.user.id, lifetime.signal);
          break;
        case "leave":
          await owner.leaveGroup(context, group.id, lifetime.signal);
          break;
      }
      if (!(await current(ticket, lifetime.signal))) return;
      if (action.kind === "leave") {
        onLeft();
        return;
      }
      next = { phase: "result", intent, outcome: "confirmed" };
    } catch (error) {
      if (!(await current(ticket, lifetime.signal))) return;
      const failure = lifecycleFailure(error);
      deadline.current = failure.until;
      setUntil(failure.until);
      if (failure.kind === "unavailable") {
        onUnavailable();
        return;
      }
      next = {
        phase: "result",
        intent,
        outcome: failure.kind === "ambiguous" ? "ambiguous" : "rejected",
        failure: failure.kind,
      };
    } finally {
      if (ticket === generation.current) busy.current = false;
    }
    setState(next);
    if (next.outcome !== "ambiguous" && next.failure !== "rate") await check(next);
  };
  const finish = () => {
    if (busy.current || !verified || state.verification === "failed" || !state.verification) return;
    setState({ phase: "idle" });
  };
  return { state, revision, verified, cooldown, begin, cancel, send, check, finish };
}
