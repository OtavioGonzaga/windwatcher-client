import { afterEach, describe, expect, it, vi } from "vitest";
import { fetch } from "@tauri-apps/plugin-http";
import { browserHttp } from "./browser-http";
import { platformHttp } from "./http";
import { tauriHttp } from "./tauri-http";
import { ApiClient } from "../api/client";
import { ConversationsApi } from "../../features/conversations/api";

vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn(async () => Response.json({})) }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("platform network selection", () => {
  it.each(["rename", "add", "role", "remove", "transfer", "leave"] as const)(
    "carries lifecycle %s through the native adapter without an idempotency key",
    async (action) => {
      const id = "019a0000-0000-7000-8000-000000000011";
      const target = "019a0000-0000-7000-8000-000000000012";
      const date = "2026-11-06T12:00:00Z";
      const group = {
        id,
        title: "Group",
        kind: "group",
        membership: { role: "admin" },
        created_at: date,
        updated_at: date,
        unread_count: 0,
      };
      const member = { user: { id: target, username: "peer" }, role: "member", joined_at: date };
      vi.mocked(fetch).mockResolvedValueOnce(
        action === "remove" || action === "leave"
          ? new Response(null, { status: 204 })
          : Response.json(action === "add" || action === "role" ? member : group),
      );
      const api = new ConversationsApi(
        new ApiClient({ baseUrl: "https://example.test/proxy/", transport: tauriHttp }),
      );
      switch (action) {
        case "rename":
          await api.renameGroup("fixture", id, "Exact", {});
          break;
        case "add":
          await api.addMember("fixture", id, target, {});
          break;
        case "role":
          await api.changeMemberRole("fixture", id, target, "admin", {});
          break;
        case "remove":
          await api.removeMember("fixture", id, target, {});
          break;
        case "transfer":
          await api.transferOwner("fixture", id, target, {});
          break;
        case "leave":
          await api.leaveGroup("fixture", id, {});
          break;
      }
      const sent = vi.mocked(fetch).mock.calls[0]![1]!;
      expect(new Headers(sent.headers).has("Idempotency-Key")).toBe(false);
      expect(sent.credentials).toBe("omit");
      expect(sent.maxRedirections).toBe(0);
      if (action === "add" || action === "remove" || action === "leave") {
        expect(sent.body).toBeUndefined();
        expect(new Headers(sent.headers).has("Content-Type")).toBe(false);
      }
    },
  );
  it("passes a single explicit idempotency header unchanged through native HTTP", async () => {
    const headers = new Headers({
      Authorization: "Bearer fixture",
      "Idempotency-Key": "fixture-Key~",
    });
    const url = new URL("https://example.test/proxy/v1/conversations");
    await tauriHttp(url, {
      method: "POST",
      headers,
      signal: new AbortController().signal,
      body: "{}",
    });
    const sent = new Headers(vi.mocked(fetch).mock.calls[0]![1]?.headers);
    expect(sent.get("Idempotency-Key")).toBe("fixture-Key~");
    expect([...sent].filter(([name]) => name === "idempotency-key")).toHaveLength(1);
  });
  it("uses browser fetch when native IPC is absent", async () => {
    expect(await platformHttp()).toBe(browserHttp);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("selects native HTTP from the installed-host flag", async () => {
    vi.stubGlobal("isTauri", true);
    expect(await platformHttp()).toBe(tauriHttp);
  });
  it("disables native redirects and does not expose TLS or proxy overrides", async () => {
    const headers = new Headers({ Authorization: "Bearer fixture" });
    const signal = new AbortController().signal;
    const url = new URL("http://example.test:8080/prefix/v1/instance");
    await tauriHttp(url, { method: "GET", headers, signal });
    expect(fetch).toHaveBeenCalledWith(url, {
      method: "GET",
      headers,
      signal,
      credentials: "omit",
      maxRedirections: 0,
    });
  });
});
