import type { components } from "../../shared/api/schema.generated";
import { serverUuid, utcTimestamp } from "../authentication/validation";
import { decodeConversation } from "./validation";

export type CreateGroup = components["schemas"]["CreateGroupRequest"];
export type GroupScope = {
  readonly profileId: string;
  readonly accountId: string;
  readonly userId: string;
  readonly epoch: number;
};

export type TitleIssue = "blank" | "long" | "unicode";

export function groupTitleIssue(title: string): TitleIssue | undefined {
  if (/[\uD800-\uDFFF]/u.test(title)) return "unicode";
  if (new TextEncoder().encode(title).byteLength > 256) return "long";
  // Rust str::trim uses Unicode White_Space, not ECMAScript trim (FEFF/0085 differ).
  if (/^\p{White_Space}*$/u.test(title)) return "blank";
  return undefined;
}

export function groupDraft(title: string, ids: readonly string[], actor: string): CreateGroup {
  if (groupTitleIssue(title)) throw new TypeError("Invalid Group title.");
  const participant_ids = [...new Set(ids.map(serverUuid))].filter((id) => id !== actor).sort();
  if (participant_ids.length > 256) throw new TypeError("Too many Group participants.");
  return { kind: "group", title, participant_ids };
}

export type Member = components["schemas"]["MemberResponse"];
export type MemberPage = components["schemas"]["PageResponse_MemberResponse"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error("Invalid Group response.");
  return value;
}
function groupRole(value: unknown): "owner" | "admin" | "member" {
  if (value !== "owner" && value !== "admin" && value !== "member")
    throw new Error("Invalid Group role.");
  return value;
}
export function memberCursor(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.length ||
    new TextEncoder().encode(value).byteLength > 1024
  )
    throw new Error("Invalid member cursor.");
  return value;
}
export function decodeGroup(value: unknown) {
  const conversation = decodeConversation(value);
  if (conversation.kind !== "group") throw new Error("Invalid Group response.");
  groupRole(conversation.membership.role);
  return conversation;
}
export function decodeMemberPage(value: unknown): MemberPage {
  const page = record(value);
  if (!Array.isArray(page.items) || page.items.length > 50 || typeof page.has_more !== "boolean")
    throw new Error("Invalid member page.");
  const cursor = page.next_cursor == null ? page.next_cursor : memberCursor(page.next_cursor);
  if (page.has_more !== (cursor != null)) throw new Error("Invalid member page.");
  const items = page.items.map((entry): Member => {
    const m = record(entry);
    const user = record(m.user);
    if (typeof user.username !== "string" || !/^[a-z0-9_]{3,32}$/.test(user.username))
      throw new Error("Invalid member identity.");
    return {
      user: { id: serverUuid(user.id), username: user.username },
      role: groupRole(m.role),
      joined_at: utcTimestamp(m.joined_at),
    };
  });
  if (new Set(items.map((m) => m.user.id)).size !== items.length)
    throw new Error("Duplicate member.");
  return {
    items,
    has_more: page.has_more,
    ...(cursor === undefined ? {} : { next_cursor: cursor }),
  };
}
