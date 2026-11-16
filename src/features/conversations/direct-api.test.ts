import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "../../shared/api/client";
import type { HttpTransport } from "../../shared/api/transport";
import { ConversationsApi } from "./api";
import { decodeExactUser } from "./direct-validation";

const id = "019a0000-0000-7000-8000-000000000011";
const date = "2026-11-06T12:00:00Z";
const direct = {
  id,
  kind: "direct",
  title: "alice",
  created_at: date,
  updated_at: date,
  membership: { role: "direct" },
  unread_count: 0,
};
describe("exact discovery and Direct API", () => {
  it("sends original input, no cursor and accepts only its canonical match", async () => {
    const transport = vi.fn<HttpTransport>(async () =>
      Response.json({
        items: [{ id, username: "alice" }],
        has_more: false,
        next_cursor: null,
      }),
    );
    const api = new ConversationsApi(
      new ApiClient({ baseUrl: "https://example.test/proxy/", transport }),
    );
    expect(await api.findExactUsername("fixture.token.signature", "ALIce", {})).toEqual({
      id,
      username: "alice",
    });
    expect(transport.mock.calls[0]![0].href).toBe(
      "https://example.test/proxy/v1/users?username=ALIce",
    );
    expect(new Headers(transport.mock.calls[0]![1].headers).has("Idempotency-Key")).toBe(false);
    expect(decodeExactUser({ items: [], has_more: false }, "missing")).toBeNull();
  });
  it.each([
    {
      items: [
        { id, username: "alice" },
        { id, username: "alice" },
      ],
      has_more: false,
    },
    { items: [], has_more: true },
    { items: [], has_more: false, next_cursor: "cursor" },
    { items: [{ id: "bad", username: "alice" }], has_more: false },
    { items: [{ id, username: "bob" }], has_more: false },
    { items: [{ id, username: "<b>alice</b>" }], has_more: false },
  ])("rejects malformed/mismatched discovery", (page) => {
    expect(() => decodeExactUser(page, "alice")).toThrow();
  });
  it.each([200, 201])("accepts Direct HTTP %s with exact keyed payload", async (status) => {
    const transport = vi.fn<HttpTransport>(async () => Response.json(direct, { status }));
    const api = new ConversationsApi(
      new ApiClient({ baseUrl: "https://example.test/proxy/", transport }),
    );
    expect((await api.openDirect("fixture.token.signature", id, "fixed-key", {})).id).toBe(id);
    const [url, init] = transport.mock.calls[0]!;
    expect(url.pathname).toBe("/proxy/v1/conversations");
    expect(JSON.parse(String(init.body))).toEqual({ kind: "direct", participant_id: id });
    expect(new Headers(init.headers).get("Idempotency-Key")).toBe("fixed-key");
  });
  it("rejects a Group masquerading as creation success", async () => {
    const api = new ConversationsApi(
      new ApiClient({
        baseUrl: "https://example.test/",
        transport: async () =>
          Response.json({ ...direct, kind: "group", membership: { role: "owner" } }),
      }),
    );
    await expect(api.openDirect("fixture.token.signature", id, "key", {})).rejects.toMatchObject({
      category: "invalid-response",
    });
  });
});
