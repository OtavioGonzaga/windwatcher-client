import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "../../shared/api/client";
import { ConversationsApi } from "./api";

const date = "2026-11-09T12:00:00Z";
const user = "01890f3e-7b12-7123-8123-123456789abc";
const id = (n: number) => `01890f3e-7b12-7123-8123-${n.toString(16).padStart(12, "0")}`;

describe("conversation response budgets", () => {
  it.each(["list", "detail"] as const)(
    "times out a stalled %s GET even if the transport ignores abort",
    async (operation) => {
      vi.useFakeTimers();
      try {
        const api = new ConversationsApi(
          new ApiClient({
            baseUrl: "https://example.test/",
            transport: () => new Promise<Response>(() => {}),
          }),
        );
        const pending =
          operation === "list"
            ? api.list("fixture.token.signature", undefined, {})
            : api.get("fixture.token.signature", id(1), {});
        const rejected = expect(pending).rejects.toMatchObject({ category: "timeout" });
        await vi.advanceTimersByTimeAsync(15_000);
        await rejected;
      } finally {
        vi.useRealTimers();
      }
    },
  );
  it("accepts 50 worst-case escaped 128 KiB messages and shallow replies", async () => {
    // Each control byte expands to six JSON bytes. Two 128 KiB fields per row
    // produce about 75 MiB, close to the list's 84 MiB streaming budget.
    const text = "\u0001".repeat(128 * 1024);
    const items = Array.from({ length: 50 }, (_, n) => ({
      id: id(n + 1),
      kind: "group",
      title: `Group ${n}`,
      created_at: date,
      updated_at: date,
      membership: { role: "member" },
      unread_count: n,
      last_message: {
        id: user,
        conversation_id: id(n + 1),
        sender_id: user,
        sender_username: "alice",
        created_at: date,
        content: text,
        reply_to: { id: user, sender_id: user, sender_username: "alice", content: text },
      },
    }));
    const api = new ConversationsApi(
      new ApiClient({
        baseUrl: "https://example.test/prefix/",
        transport: async () => Response.json({ items, has_more: false }),
      }),
    );
    const page = await api.list("fixture.token.signature", undefined, {});
    expect(page.items).toHaveLength(50);
    expect(page.items[49]?.last_message?.content).toHaveLength(128 * 1024);
    expect(page.items[0]?.last_message?.reply_to?.content).toHaveLength(128 * 1024);
  }, 60_000);

  it("rejects a detail response beyond its 4 MiB budget before decoding", async () => {
    const api = new ConversationsApi(
      new ApiClient({
        baseUrl: "https://example.test/",
        transport: async () =>
          new Response("{}", {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Content-Length": String(4 * 1024 * 1024 + 1),
            },
          }),
      }),
    );
    await expect(api.get("fixture.token.signature", id(1), {})).rejects.toMatchObject({
      category: "response-too-large",
    });
  });
});
