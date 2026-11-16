import type { components } from "../../shared/api/schema.generated";
import { serverUuid, utcTimestamp } from "../authentication/validation";

export type Conversation = components["schemas"]["ConversationResponse"];
export type ConversationPage = components["schemas"]["PageResponse_ConversationResponse"];
type Message = components["schemas"]["MessageResponse"];
type Reply = components["schemas"]["ReplyPreviewResponse"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error("Invalid response.");
  return value;
}
function text(value: unknown): string {
  if (typeof value !== "string") throw new Error("Invalid response.");
  return value;
}
function optional<T>(value: unknown, decode: (value: unknown) => T): T | null | undefined {
  return value == null ? value : decode(value);
}
function reply(value: unknown): Reply {
  const r = record(value);
  const deleted = optional(r.deleted_at, utcTimestamp);
  const content = optional(r.content, text);
  if (deleted && content != null) throw new Error("Invalid response.");
  return {
    id: serverUuid(r.id),
    sender_id: serverUuid(r.sender_id),
    sender_username: text(r.sender_username),
    ...(content === undefined ? {} : { content }),
    ...(deleted === undefined ? {} : { deleted_at: deleted }),
  };
}
function message(value: unknown, conversationId: string): Message {
  const m = record(value);
  const id = serverUuid(m.conversation_id);
  if (id !== conversationId) throw new Error("Invalid response.");
  const deleted = optional(m.deleted_at, utcTimestamp);
  const content = optional(m.content, text);
  if (deleted && content != null) throw new Error("Invalid response.");
  const edited = optional(m.edited_at, utcTimestamp);
  const reference = optional(m.reply_to, reply);
  return {
    id: serverUuid(m.id),
    conversation_id: id,
    sender_id: serverUuid(m.sender_id),
    sender_username: text(m.sender_username),
    created_at: utcTimestamp(m.created_at),
    ...(content === undefined ? {} : { content }),
    ...(deleted === undefined ? {} : { deleted_at: deleted }),
    ...(edited === undefined ? {} : { edited_at: edited }),
    ...(reference === undefined ? {} : { reply_to: reference }),
  };
}
export function decodeConversation(value: unknown): Conversation {
  const c = record(value);
  const membership = record(c.membership);
  const id = serverUuid(c.id);
  if (c.kind !== "direct" && c.kind !== "group") throw new Error("Invalid response.");
  const role = membership.role;
  if (role !== "direct" && role !== "owner" && role !== "admin" && role !== "member")
    throw new Error("Invalid response.");
  if (
    typeof c.unread_count !== "number" ||
    !Number.isSafeInteger(c.unread_count) ||
    c.unread_count < 0
  )
    throw new Error("Invalid response.");
  const lastRead = optional(membership.last_read_message_id, serverUuid);
  const last = optional(c.last_message, (item) => message(item, id));
  return {
    id,
    kind: c.kind,
    title: text(c.title),
    created_at: utcTimestamp(c.created_at),
    updated_at: utcTimestamp(c.updated_at),
    membership: {
      role,
      ...(lastRead === undefined ? {} : { last_read_message_id: lastRead }),
    },
    unread_count: c.unread_count,
    ...(last === undefined ? {} : { last_message: last }),
  };
}
export function decodeConversationPage(value: unknown): ConversationPage {
  const page = record(value);
  if (!Array.isArray(page.items) || page.items.length > 50 || typeof page.has_more !== "boolean")
    throw new Error("Invalid response.");
  const cursor = optional(page.next_cursor, text);
  if (cursor != null && (!cursor.length || new TextEncoder().encode(cursor).byteLength > 1024))
    throw new Error("Invalid response.");
  if (page.has_more !== (cursor != null)) throw new Error("Invalid response.");
  const items = page.items.map(decodeConversation);
  if (new Set(items.map((item) => item.id)).size !== items.length)
    throw new Error("Invalid response.");
  return {
    items,
    has_more: page.has_more,
    ...(cursor === undefined ? {} : { next_cursor: cursor }),
  };
}
