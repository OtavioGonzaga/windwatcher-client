import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "../../shared/api/client";
import type { HttpTransport } from "../../shared/api/transport";
import { ConversationsApi } from "./api";
import { decodeGroup, decodeMemberPage } from "./group-validation";

const id = "019a0000-0000-7000-8000-000000000011";
const date = "2026-11-06T12:00:00Z";
const member = { user: { id, username: "alice" }, role: "owner", joined_at: date };
const group = {
  id,
  title: "Server renamed",
  kind: "group",
  created_at: date,
  updated_at: date,
  membership: { role: "member" },
  unread_count: 0,
};
describe("Group wire contract", () => {
  it.each([200, 201])("accepts current Group representation with HTTP %s", async (status) => {
    const transport = vi.fn<HttpTransport>(async () => Response.json(group, { status }));
    const api = new ConversationsApi(
      new ApiClient({ baseUrl: "https://example.test/proxy/", transport }),
    );
    expect(
      await api.createGroup(
        "fixture.token.signature",
        { kind: "group", title: " exact ", participant_ids: [] },
        "exact-Key~",
        {},
      ),
    ).toEqual(group);
    const [url, init] = transport.mock.calls[0]!;
    expect(url.pathname).toBe("/proxy/v1/conversations");
    expect(JSON.parse(String(init.body))).toEqual({
      kind: "group",
      title: " exact ",
      participant_ids: [],
    });
    expect(new Headers(init.headers).get("Idempotency-Key")).toBe("exact-Key~");
  });
  it("sends only next-only member query and no key", async () => {
    const transport = vi.fn<HttpTransport>(async () =>
      Response.json({ items: [member], has_more: false }),
    );
    const api = new ConversationsApi(
      new ApiClient({ baseUrl: "https://example.test/proxy/", transport }),
    );
    await api.listMembers("fixture.token.signature", id, "opaque/+==", {});
    const [url, init] = transport.mock.calls[0]!;
    expect(url.pathname).toBe(`/proxy/v1/conversations/${id}/members`);
    expect([...url.searchParams]).toEqual([
      ["limit", "50"],
      ["cursor", "opaque/+=="],
    ]);
    expect(new Headers(init.headers).has("Idempotency-Key")).toBe(false);
    expect(() => api.listMembers("fixture.token.signature", id, "x".repeat(1025), {})).toThrow();
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it.each(["direct", "unknown"])("rejects own role %s", (role) => {
    expect(() => decodeGroup({ ...group, membership: { role } })).toThrow();
  });
  it("rejects Direct masquerading as Group", () => {
    expect(() => decodeGroup({ ...group, kind: "direct" })).toThrow();
  });
  it("drops unknown fields, including private watermarks, but accepts partial role pages", () => {
    expect(
      decodeMemberPage({
        items: [
          {
            ...member,
            role: "admin",
            last_read_message_id: id,
            user: { ...member.user, disabled: true },
          },
        ],
        has_more: true,
        next_cursor: "next",
      }),
    ).toEqual({
      items: [{ ...member, role: "admin" }],
      has_more: true,
      next_cursor: "next",
    });
  });
  it.each([
    { items: [member, member], has_more: false },
    { items: [{ ...member, role: "direct" }], has_more: false },
    { items: [{ ...member, joined_at: "not-a-date" }], has_more: false },
    { items: [{ ...member, user: { id: "invalid", username: "alice" } }], has_more: false },
    { items: [{ ...member, user: { id, username: "Alice" } }], has_more: false },
    { items: [], has_more: true },
    { items: [], has_more: false, next_cursor: "next" },
    { items: [], has_more: true, next_cursor: "é".repeat(513) },
    { items: Array.from({ length: 51 }, () => member), has_more: false },
  ])("rejects malformed member pages", (page) => {
    expect(() => decodeMemberPage(page)).toThrow();
  });
});
