import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "../../shared/api/client";
import { ApiError } from "../../shared/api/error";
import type { HttpTransport } from "../../shared/api/transport";
import { grant, user } from "../../../tests/fixtures/authentication";
import { problem } from "../../../tests/fixtures/instance";
import { AuthApi } from "./api";
import { authFailure } from "./errors";
import { MAX_GRANT_RESPONSE_BYTES, MAX_USER_RESPONSE_BYTES } from "./validation";

function setup(
  response: () => Response | Promise<Response>,
  baseUrl = "https://example.test/proxy/",
) {
  const transport = vi.fn<HttpTransport>(async () => response());
  const client = new ApiClient({ baseUrl, transport });
  return { api: new AuthApi(client), client, transport };
}

describe("server-bound authentication API", () => {
  it("cleans only an explicit fresh bearer session with one bodyless DELETE/204", async () => {
    const { api, transport } = setup(() => new Response(null, { status: 204 }));
    await api.revokeUncommitted(grant.access_token);
    const [url, request] = transport.mock.calls[0]!;
    expect(url.href).toBe("https://example.test/proxy/v1/sessions/current");
    expect(request.method).toBe("DELETE");
    expect(request.body).toBeUndefined();
    expect(request.headers.get("Authorization")).toBe(`Bearer ${grant.access_token}`);
    expect(transport).toHaveBeenCalledOnce();
  });
  it.each(["https://example.test/proxy/", "http://127.0.0.1:8080/", "http://[::1]:8080/prefix/"])(
    "uses exact public request bodies, paths and statuses for %s",
    async (root) => {
      const { api, transport } = setup(() => Response.json(user, { status: 201 }), root);
      const password = "  synthetic e\u0301 👩‍💻 password  ";
      await expect(api.register("Alice", password)).resolves.toEqual(user);
      const [url, request] = transport.mock.calls[0]!;
      expect(url.href).toBe(`${root}v1/users`);
      expect(request.method).toBe("POST");
      expect(request.headers.get("Authorization")).toBeNull();
      expect(request.headers.get("Cookie")).toBeNull();
      expect(JSON.parse(request.body!)).toEqual({ username: "Alice", password });
      expect(transport).toHaveBeenCalledOnce(); // No auto-login after registration.
    },
  );
  it("login and refresh are public; only current-user receives its explicit bearer", async () => {
    const responses = [
      Response.json(grant, { status: 201 }),
      Response.json(grant),
      Response.json(user),
    ];
    const { api, transport } = setup(() => responses.shift()!);
    await api.login("alice", "synthetic password");
    await api.refresh(grant.refresh_token);
    await api.currentUser(grant.access_token);
    expect(
      transport.mock.calls.map(([url, req]) => [
        url.href,
        req.method,
        req.headers.get("Authorization"),
      ]),
    ).toEqual([
      ["https://example.test/proxy/v1/sessions", "POST", null],
      ["https://example.test/proxy/v1/sessions/refresh", "POST", null],
      ["https://example.test/proxy/v1/users/me", "GET", `Bearer ${grant.access_token}`],
    ]);
    expect(JSON.parse(transport.mock.calls[1]![1].body!)).toEqual({
      refresh_token: grant.refresh_token,
    });
    expect(transport.mock.calls[2]![1].body).toBeUndefined();
  });
  it("cannot inherit auth from untyped lifetime input or another server/client", async () => {
    const publicLifetime = { accessToken: "wrong.server.secret", body: { unexpected: true } };
    const a = setup(() => Response.json(grant, { status: 201 }));
    const b = setup(() => Response.json(grant, { status: 201 }), "https://other.test/");
    await a.api.login("alice", "synthetic password", publicLifetime as object);
    await b.api.login("bob", "synthetic password", publicLifetime as object);
    expect(a.transport.mock.calls[0]![1].headers.has("Authorization")).toBe(false);
    expect(b.transport.mock.calls[0]![1].headers.has("Authorization")).toBe(false);
    expect(b.transport.mock.calls[0]![0].href).toBe("https://other.test/v1/sessions");
  });
  it.each([200, 202, 204, 206])(
    "rejects login status %s without accepting a grant",
    async (status) => {
      const { api } = setup(() =>
        status === 204 ? new Response(null, { status }) : Response.json(grant, { status }),
      );
      await expect(api.login("alice", "synthetic password")).rejects.toMatchObject({
        category: "invalid-response",
      });
    },
  );
  it("rejects a refresh 201 and registration 200 rather than guessing success", async () => {
    await expect(
      setup(() => Response.json(grant, { status: 201 })).api.refresh(grant.refresh_token),
    ).rejects.toMatchObject({ category: "invalid-response" });
    await expect(
      setup(() => Response.json(user)).api.register("alice", "synthetic password"),
    ).rejects.toMatchObject({ category: "invalid-response" });
  });
  it.each(["register", "login", "refresh"] as const)(
    "never automatically retries %s after transport loss",
    async (method) => {
      const { api, transport } = setup(() => {
        throw new Error("untrusted secret-bearing exception");
      });
      const promise =
        method === "refresh"
          ? api.refresh(grant.refresh_token)
          : api[method]("alice", "synthetic password");
      await expect(promise).rejects.toMatchObject({ category: "transport" });
      expect(transport).toHaveBeenCalledOnce();
    },
  );
  it("does not send invalid local bearer/refresh input", () => {
    const { api, transport } = setup(() => Response.json(grant));
    expect(() => api.refresh("malformed")).toThrow("Invalid authentication response.");
    expect(() => api.currentUser("a.b.c\r\n")).toThrow("Invalid authentication response.");
    expect(transport).not.toHaveBeenCalled();
  });
  it.each(["login", "register", "currentUser", "refresh"] as const)(
    "bounds %s response bytes before JSON decoding",
    async (method) => {
      const budget =
        method === "login" || method === "refresh"
          ? MAX_GRANT_RESPONSE_BYTES
          : MAX_USER_RESPONSE_BYTES;
      const { api } = setup(
        () =>
          new Response("é".repeat(budget / 2 + 1), {
            status: method === "login" || method === "register" ? 201 : 200,
            headers: { "Content-Type": "application/json" },
          }),
      );
      const pending =
        method === "refresh"
          ? api.refresh(grant.refresh_token)
          : method === "currentUser"
            ? api.currentUser(grant.access_token)
            : api[method]("alice", "synthetic password");
      await expect(pending).rejects.toMatchObject({ category: "response-too-large" });
    },
  );
  it.each([
    () => new Response("{", { status: 201, headers: { "Content-Type": "application/json" } }),
    () =>
      new Response(JSON.stringify(grant), {
        status: 201,
        headers: { "Content-Type": "text/plain" },
      }),
    () => Response.json({ ...grant, token_type: "Basic" }, { status: 201 }),
  ])("rejects bad JSON/media/grants (%#)", async (response) => {
    await expect(setup(response).api.login("alice", "synthetic password")).rejects.toMatchObject({
      category: "invalid-response",
    });
  });
  it("refuses redirects and preserves safe rate-limit metadata without retries", async () => {
    const redirected = setup(
      () => new Response(null, { status: 307, headers: { Location: "https://other.test/" } }),
    );
    await expect(redirected.api.login("alice", "synthetic password")).rejects.toMatchObject({
      category: "redirect",
    });
    expect(redirected.transport).toHaveBeenCalledOnce();
    const limited = setup(() =>
      Response.json(problem(429, "rate_limit.exceeded"), {
        status: 429,
        headers: { "Retry-After": "5" },
      }),
    );
    await expect(limited.api.refresh(grant.refresh_token)).rejects.toMatchObject({
      metadata: { retryAfterMs: 5000 },
    });
    expect(limited.transport).toHaveBeenCalledOnce();
  });
  it("cancels before submission without credentials leaving the process", async () => {
    const { api, transport } = setup(() => Response.json(grant));
    const controller = new AbortController();
    controller.abort();
    await expect(
      api.login("alice", "synthetic password", { signal: controller.signal }),
    ).rejects.toMatchObject({ category: "cancelled" });
    expect(transport).not.toHaveBeenCalled();
  });
});

describe("safe auth problem mapping", () => {
  it.each([
    [401, "auth.invalid_credentials", "invalid-credentials"],
    [403, "auth.user_disabled", "disabled"],
    [401, "auth.invalid_refresh_token", "invalid-refresh"],
    [401, "auth.invalid_access_token", "invalid-access"],
    [403, "registration.closed", "registration-closed"],
    [409, "user.username_taken", "username-taken"],
    [422, "user.invalid_username", "invalid-username"],
    [422, "user.invalid_password", "invalid-password"],
    [400, "unknown", "bad-request"],
    [401, "unknown", "unauthorized"],
    [403, "unknown", "forbidden"],
    [409, "unknown", "conflict"],
    [413, "unknown", "too-large"],
    [415, "unknown", "unsupported-media"],
    [422, "unknown", "invalid-input"],
    [429, "unknown", "rate-limited"],
    [500, "internal.error", "server"],
    [403, "auth.invalid_credentials", "forbidden"],
    [400, "constructor", "bad-request"],
  ] as const)("maps %s %s to %s", (status, code, expected) => {
    expect(authFailure(new ApiError("http", { status, code }))).toBe(expected);
  });
  it.each([
    ["transport", "network"],
    ["timeout", "timeout"],
    ["cancelled", "cancelled"],
    ["redirect", "redirect"],
    ["response-too-large", "malformed"],
    ["invalid-response", "malformed"],
  ] as const)(
    "maps %s without pretending to diagnose browser network causes",
    (category, expected) => {
      expect(authFailure(new ApiError(category))).toBe(expected);
    },
  );
  it("never returns raw exceptions or server text", async () => {
    expect(authFailure(new Error("untrusted secret-bearing exception"))).toBe("unknown");
    const { api } = setup(() =>
      Response.json(
        { ...problem(401, "auth.invalid_credentials"), detail: "untrusted secret-bearing detail" },
        { status: 401 },
      ),
    );
    try {
      await api.login("alice", "synthetic password");
      expect.fail("Expected failure");
    } catch (error) {
      expect(authFailure(error)).toBe("invalid-credentials");
      expect(JSON.stringify(error)).not.toContain("untrusted secret-bearing");
    }
  });
});
