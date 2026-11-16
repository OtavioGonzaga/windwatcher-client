import { ApiError } from "../../shared/api/error";
import type { AuthenticationService } from "../authentication/service";
import type { GroupScope, Member } from "./group-validation";
import type { Conversation } from "./validation";

export type GroupAction =
  | { kind: "rename"; title: string }
  | { kind: "add"; target: Readonly<{ id: string; username: string }> }
  | { kind: "role"; target: Readonly<Member>; role: "admin" | "member" }
  | { kind: "remove" | "transfer"; target: Readonly<Member> }
  | { kind: "leave"; destructive: boolean };
export type GroupIntent = Readonly<{
  scope: Readonly<GroupScope>;
  groupId: string;
  sourceRole: Conversation["membership"]["role"];
  action: GroupAction;
}>;
export function groupIntent(
  scope: GroupScope,
  group: Conversation,
  action: GroupAction,
): GroupIntent {
  const captured = structuredClone(action);
  if ("target" in captured) {
    if ("user" in captured.target) Object.freeze(captured.target.user);
    Object.freeze(captured.target);
  }
  return Object.freeze({
    scope: Object.freeze({
      profileId: scope.profileId,
      accountId: scope.accountId,
      userId: scope.userId,
      epoch: scope.epoch,
    }),
    groupId: group.id,
    sourceRole: group.membership.role,
    action: Object.freeze(captured),
  });
}
export type LifecycleFailure =
  | "permission"
  | "unavailable"
  | "targetMissing"
  | "ownerProtected"
  | "transferRequired"
  | "unsupported"
  | "participant"
  | "title"
  | "input"
  | "session"
  | "rate"
  | "ambiguous";
export function lifecycleFailure(error: unknown): { kind: LifecycleFailure; until: number } {
  if (!(error instanceof ApiError) || error.category !== "http")
    return { kind: "ambiguous", until: 0 };
  const { status, code } = error.metadata;
  const pairs: readonly [number, string, LifecycleFailure][] = [
    [401, "auth.invalid_access_token", "session"],
    [403, "conversation.insufficient_permissions", "permission"],
    [404, "conversation.not_found", "unavailable"],
    [404, "conversation.member_not_found", "targetMissing"],
    [409, "conversation.owner_protected", "ownerProtected"],
    [409, "conversation.ownership_transfer_required", "transferRequired"],
    [409, "conversation.operation_not_supported", "unsupported"],
    [422, "conversation.participant_unavailable", "participant"],
    [422, "conversation.invalid_title", "title"],
    [400, "request.invalid_json", "input"],
    [400, "request.invalid_identifier", "input"],
    [400, "request.invalid_path", "input"],
  ];
  if (status === 429 && code === "rate_limit.exceeded")
    return { kind: "rate", until: Date.now() + (error.metadata.retryAfterMs ?? 1000) };
  return { kind: pairs.find(([s, c]) => status === s && code === c)?.[2] ?? "ambiguous", until: 0 };
}
export type Reconciliation = "matches" | "differs" | "unverified" | "noAccess";
type Reader = Pick<AuthenticationService, "getConversation" | "listGroupMembers">;
type Context = NonNullable<ReturnType<AuthenticationService["activeContext"]>>;

/** A bounded fresh traversal is an observation, never a transaction or proof of causality. */
export async function reconcileGroup(
  reader: Reader,
  context: Context,
  intent: GroupIntent,
  signal: AbortSignal,
): Promise<{ group?: Conversation; result: Reconciliation }> {
  let group: Conversation;
  try {
    group = await reader.getConversation(context, intent.groupId, signal);
  } catch (error) {
    if (lifecycleFailure(error).kind === "unavailable") return { result: "noAccess" };
    throw error;
  }
  if (group.kind !== "group") return { group, result: "differs" };
  const action = intent.action;
  if (action.kind === "rename")
    return { group, result: group.title === action.title ? "matches" : "differs" };
  if (action.kind === "leave") return { group, result: "differs" };
  let cursor: string | undefined;
  const cursors = new Set<string>();
  for (let pageNumber = 0; pageNumber < 10; pageNumber++) {
    let page: Awaited<ReturnType<Reader["listGroupMembers"]>>;
    try {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Each continuation depends on the previous page.
      page = await reader.listGroupMembers(context, intent.groupId, cursor, signal);
    } catch (error) {
      if (lifecycleFailure(error).kind === "unavailable") return { result: "noAccess" };
      throw error;
    }
    if (signal.aborted) throw new ApiError("cancelled");
    if (pageNumber === 0 && page.items.length === 0) throw new ApiError("invalid-response");
    const targetId = action.kind === "add" ? action.target.id : action.target.user.id;
    const target = page.items.find((member) => member.user.id === targetId);
    if (target) {
      const matches =
        action.kind === "add" ||
        (action.kind === "role" && target.role === action.role) ||
        (action.kind === "transfer" && target.role === "owner");
      return { group, result: matches ? "matches" : "differs" };
    }
    if (!page.has_more) return { group, result: action.kind === "remove" ? "matches" : "differs" };
    if (!page.next_cursor || cursors.has(page.next_cursor)) throw new ApiError("invalid-response");
    cursors.add(page.next_cursor);
    cursor = page.next_cursor;
  }
  return { group, result: "unverified" };
}
export function soleOwner(
  group: Conversation,
  actor: string,
  page: { items: Member[]; has_more: boolean; next_cursor?: string | null },
) {
  return (
    group.kind === "group" &&
    group.membership.role === "owner" &&
    page.items.length === 1 &&
    page.items[0]!.user.id === actor &&
    page.items[0]!.role === "owner" &&
    !page.has_more &&
    page.next_cursor == null
  );
}
