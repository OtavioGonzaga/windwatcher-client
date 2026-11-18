import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "../../shared/api/client";
import type { HttpTransport } from "../../shared/api/transport";
import { ConversationsApi } from "./api";

const id = "019a0000-0000-7000-8000-000000000011";
const target = "019a0000-0000-7000-8000-000000000012";
const date = "2026-11-06T12:00:00Z";
const member = { user: { id: target, username: "alice" }, role: "admin", joined_at: date };
const group = {
  id,
  title: " Current ",
  kind: "group",
  created_at: date,
  updated_at: date,
  membership: { role: "admin" },
  unread_count: 0,
};
const cases = [
  {
    action: "rename",
    method: "PATCH",
    path: "",
    body: { title: " exact 😀 " },
    status: 200,
    result: group,
  },
  { action: "add", method: "PUT", path: `/members/${target}`, status: 201, result: member },
  {
    action: "role",
    method: "PATCH",
    path: `/members/${target}`,
    body: { role: "member" },
    status: 200,
    result: member,
  },
  { action: "remove", method: "DELETE", path: `/members/${target}`, status: 204 },
  {
    action: "transfer",
    method: "PUT",
    path: "/owner",
    body: { user_id: target },
    status: 200,
    result: group,
  },
  { action: "leave", method: "DELETE", path: "/members/me", status: 204 },
] as const;
function invoke(api: ConversationsApi, action: string, signal?: AbortSignal) {
  const lifetime = { signal };
  switch (action) {
    case "rename":
      return api.renameGroup("fixture.token.signature", id, " exact 😀 ", lifetime);
    case "add":
      return api.addMember("fixture.token.signature", id, target, lifetime);
    case "role":
      return api.changeMemberRole("fixture.token.signature", id, target, "member", lifetime);
    case "remove":
      return api.removeMember("fixture.token.signature", id, target, lifetime);
    case "transfer":
      return api.transferOwner("fixture.token.signature", id, target, lifetime);
    default:
      return api.leaveGroup("fixture.token.signature", id, lifetime);
  }
}
describe("Group lifecycle wire contract", () => {
  it.each(cases)("$action sends exact contract without key", async (c) => {
    const transport = vi.fn<HttpTransport>(async () =>
      "result" in c
        ? Response.json(c.result, { status: c.status })
        : new Response(null, { status: 204 }),
    );
    const api = new ConversationsApi(
      new ApiClient({ baseUrl: "https://example.test/proxy/", transport }),
    );
    const signal = new AbortController().signal;
    await invoke(api, c.action, signal);
    const [url, init] = transport.mock.calls[0]!;
    expect(url.pathname).toBe(`/proxy/v1/conversations/${id}${c.path}`);
    expect(url.search).toBe("");
    expect(init.method).toBe(c.method);
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer fixture.token.signature");
    expect(new Headers(init.headers).has("Idempotency-Key")).toBe(false);
    expect(init.signal).toBeInstanceOf(AbortSignal);
    if ("body" in c) expect(JSON.parse(String(init.body))).toEqual(c.body);
    else {
      expect(init.body).toBeUndefined();
      expect(new Headers(init.headers).has("Content-Type")).toBe(false);
    }
  });
  it.each(cases)("$action rejects unexpected success status", async (c) => {
    const transport = vi.fn<HttpTransport>(async () => Response.json({}, { status: 202 }));
    const api = new ConversationsApi(
      new ApiClient({ baseUrl: "https://example.test/", transport }),
    );
    await expect(invoke(api, c.action)).rejects.toMatchObject({ category: "invalid-response" });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it.each(["rename", "transfer"])("%s rejects Direct and mismatched Group UUID", async (action) => {
    for (const value of [
      { ...group, kind: "direct" },
      { ...group, id: target },
      { ...group, membership: { role: "direct" } },
    ]) {
      const api = new ConversationsApi(
        new ApiClient({
          baseUrl: "https://example.test/",
          transport: async () => Response.json(value),
        }),
      );
      // oxlint-disable-next-line eslint/no-await-in-loop -- Verify each distinct malformed response.
      await expect(invoke(api, action)).rejects.toMatchObject({ category: "invalid-response" });
    }
  });
  it.each(["add", "role"])("%s validates target attribution and Group role", async (action) => {
    for (const value of [
      { ...member, user: { ...member.user, id } },
      { ...member, role: "direct" },
      { ...member, joined_at: "bad" },
    ]) {
      const api = new ConversationsApi(
        new ApiClient({
          baseUrl: "https://example.test/",
          transport: async () => Response.json(value),
        }),
      );
      // oxlint-disable-next-line eslint/no-await-in-loop -- Verify each distinct malformed response.
      await expect(invoke(api, action)).rejects.toMatchObject({ category: "invalid-response" });
    }
  });
  it("accepts existing Owner membership unchanged and self-transfer no-op", async () => {
    const api = new ConversationsApi(
      new ApiClient({
        baseUrl: "https://example.test/",
        transport: async () => Response.json({ ...member, role: "owner" }),
      }),
    );
    expect((await api.addMember("token", id, target, {})).role).toBe("owner");
    const self = new ConversationsApi(
      new ApiClient({
        baseUrl: "https://example.test/",
        transport: async () => Response.json({ ...group, membership: { role: "owner" } }),
      }),
    );
    expect((await self.transferOwner("token", id, target, {})).membership.role).toBe("owner");
  });
  it("rejects invalid local inputs before transport and probes at limit two", async () => {
    const transport = vi.fn<HttpTransport>(async () =>
      Response.json({ items: [member], has_more: false }),
    );
    const api = new ConversationsApi(
      new ApiClient({ baseUrl: "https://example.test/", transport }),
    );
    for (const title of [" ", "\ud800", "😀".repeat(65)])
      expect(() => api.renameGroup("token", id, title, {})).toThrow();
    expect(() => api.removeMember("token", id, "me", {})).toThrow();
    expect(() => api.transferOwner("token", "invalid", target, {})).toThrow();
    await api.probeGroupMembers("token", id, {});
    expect(transport.mock.calls[0]![0].search).toBe("?limit=2");
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it.each(cases)("$action times out once even when transport ignores abort", async (c) => {
    vi.useFakeTimers();
    try {
      const transport = vi.fn<HttpTransport>(() => new Promise(() => {}));
      const api = new ConversationsApi(
        new ApiClient({ baseUrl: "https://example.test/", transport }),
      );
      const result = expect(invoke(api, c.action)).rejects.toMatchObject({ category: "timeout" });
      await vi.advanceTimersByTimeAsync(15000);
      await result;
      expect(transport).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
