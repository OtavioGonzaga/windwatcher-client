import { describe, expect, it } from "vitest";
import { decodeConversation, decodeConversationPage } from "./validation";

const id = "01890f3e-7b12-7123-8123-123456789abc";
const other = "01890f3e-7b12-7123-8123-123456789abd";
const date = "2026-11-09T12:00:00Z";
const conversation = {
  id,
  kind: "direct",
  title: "<b>Olá 🌬</b>",
  created_at: date,
  updated_at: date,
  membership: { role: "direct" },
  unread_count: 0,
};
const message = {
  id: other,
  conversation_id: id,
  sender_id: other,
  sender_username: "alice",
  created_at: date,
  content: "hello",
};

describe("conversation response validation", () => {
  it("accepts optional and additive fields without retaining unknown data", () => {
    expect(decodeConversation({ ...conversation, extra: "ignored", last_message: null })).toEqual({
      ...conversation,
      last_message: null,
    });
    expect(
      decodeConversationPage({ items: [conversation], has_more: true, next_cursor: "opaque" }),
    ).toMatchObject({ items: [conversation], has_more: true, next_cursor: "opaque" });
  });
  it("rejects invalid pagination and duplicate IDs", () => {
    expect(() => decodeConversationPage({ items: [], has_more: true })).toThrow();
    expect(() =>
      decodeConversationPage({ items: [conversation, conversation], has_more: false }),
    ).toThrow();
    expect(() =>
      decodeConversationPage({ items: [], has_more: true, next_cursor: "x".repeat(1025) }),
    ).toThrow();
  });
  it("validates message binding and rejects tombstone bodies", () => {
    expect(
      decodeConversation({
        ...conversation,
        last_message: { ...message, content: null, deleted_at: date },
      }),
    ).toMatchObject({ last_message: { content: null, deleted_at: date } });
    expect(() =>
      decodeConversation({ ...conversation, last_message: { ...message, deleted_at: date } }),
    ).toThrow();
    expect(() =>
      decodeConversation({ ...conversation, last_message: { ...message, conversation_id: other } }),
    ).toThrow();
  });
  it("rejects invalid counts and roles", () => {
    for (const unread_count of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1])
      expect(() => decodeConversation({ ...conversation, unread_count })).toThrow();
    expect(() => decodeConversation({ ...conversation, membership: { role: "root" } })).toThrow();
  });
});
