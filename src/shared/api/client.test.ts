import { afterEach, describe, expect, it, vi } from "vitest";
import { instance, problem, requestId } from "../../../tests/fixtures/instance";
import { ApiClient } from "./client";
import { ApiError } from "./error";
import type { HttpTransport } from "./transport";
import { decodeInstance } from "./validation";

function setup(response: () => Response | Promise<Response>) {
  const transport = vi.fn<HttpTransport>(async () => response());
  return { client: new ApiClient({ baseUrl: "http://example.test/proxy/", transport }), transport };
}
afterEach(() => vi.useRealTimers());

describe("typed JSON client", () => {
  it("keeps instance requests public even for untyped extra caller fields", async () => {
    const { client, transport } = setup(() => Response.json({ ...instance, extension: true }));
    const options = { accessToken: "must-not-leak", timeoutMs: 1000 };
    expect(await client.getInstance(options)).toEqual(instance);
    const [url, request] = transport.mock.calls[0]!;
    expect(url.href).toBe("http://example.test/proxy/v1/instance");
    expect(request.headers.get("Accept")).toBe("application/json");
    expect(request.headers.has("Authorization")).toBe(false);
    expect(request.headers.has("Content-Type")).toBe(false);
    expect(request.body).toBeUndefined();
  });

  it.each(["POST", "PATCH", "PUT", "DELETE"] as const)(
    "sends explicit bearer and JSON on %s without retries",
    async (method) => {
      const { client, transport } = setup(() => Response.json(instance, { status: 201 }));
      await client.request({
        method,
        path: ["fixture"],
        body: { value: true },
        accessToken: "token-123",
        decode: decodeInstance,
      });
      const request = transport.mock.calls[0]![1];
      expect(request.headers.get("Authorization")).toBe("Bearer token-123");
      expect(request.headers.get("Content-Type")).toBe("application/json");
      expect(request.body).toBe('{"value":true}');
      expect(transport).toHaveBeenCalledTimes(1);
    },
  );

  it("handles no-content only when the caller expects it", async () => {
    const { client } = setup(() => new Response(null, { status: 204 }));
    await expect(
      client.request({ method: "DELETE", path: ["fixture"], response: "empty" }),
    ).resolves.toBeUndefined();
    await expect(client.getInstance()).rejects.toMatchObject({
      category: "invalid-response",
      metadata: { status: 204 },
    });
  });

  it.each([
    () => new Response("{", { headers: { "Content-Type": "application/json" } }),
    () => new Response("{}", { headers: { "Content-Type": "text/html" } }),
    () => Response.json({}),
    () => Response.json({ ...instance, service: {} }),
    () => Response.json({ ...instance, registration: "unknown" }),
    () => Response.json({ ...instance, api_versions: "v1" }),
    () => Response.json({ ...instance, auth_methods: [1] }),
    () => new Response("", { headers: { "Content-Type": "application/json" } }),
    () => Response.json(problem(200), { headers: { "Content-Type": "application/problem+json" } }),
  ])("rejects malformed or incompatible success payloads", async (response) => {
    await expect(setup(response).client.getInstance()).rejects.toMatchObject({
      category: "invalid-response",
      metadata: { status: 200 },
    });
  });

  it.each([
    [400, "request.invalid_json"],
    [401, "auth.invalid_credentials"],
    [403, "registration.closed"],
    [404, "request.not_found"],
    [429, "rate_limit.exceeded"],
    [500, "internal.error"],
  ] as const)("models HTTP %s without branching on prose", async (status, code) => {
    const { client } = setup(() =>
      Response.json(problem(status, code), {
        status,
        headers: {
          "Content-Type": "application/problem+json; charset=utf-8",
          "Retry-After": "3",
          "X-Request-Id": requestId,
        },
      }),
    );
    await expect(client.getInstance()).rejects.toMatchObject({
      category: "http",
      metadata: { status, code, requestId, retryAfterMs: 3000 },
    });
  });

  it.each([
    { code: "foreign.error" },
    { ...problem(400), status: 401 },
    { ...problem(400), request_id: 123 },
    { ...problem(400), title: false },
    { ...problem(400), detail: null },
    { ...problem(400), type: "about:blank" },
  ])("preserves HTTP status but invents no code for foreign/invalid problems", async (value) => {
    const { client } = setup(() => Response.json(value, { status: 400 }));
    await expect(client.getInstance()).rejects.toMatchObject({
      category: "invalid-response",
      metadata: { status: 400 },
    });
  });

  it("uses valid problem correlation when its header is absent", async () => {
    const { client } = setup(() => Response.json(problem(500), { status: 500 }));
    await expect(client.getInstance()).rejects.toMatchObject({ metadata: { requestId } });
  });

  it.each([301, 302, 303, 307, 308])("refuses redirect %s", async (status) => {
    await expect(
      setup(() => new Response(null, { status })).client.getInstance(),
    ).rejects.toMatchObject({ category: "redirect", metadata: { status } });
  });

  it("redacts platform failure causes", async () => {
    const { client } = setup(() => {
      throw new Error("Authorization secret URL?token=secret");
    });
    const error = await client.getInstance().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ category: "transport" });
    expect(JSON.stringify(error)).not.toContain("secret");
    expect(error).not.toHaveProperty("cause");
  });

  it("distinguishes cancellation from timeout and aborts the actual I/O", async () => {
    vi.useFakeTimers();
    const { client, transport } = setup(() => new Promise(() => {}));
    const timeout = client.getInstance({ timeoutMs: 50 });
    const assertion = expect(timeout).rejects.toMatchObject({ category: "timeout" });
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
    expect(transport.mock.calls[0]![1].signal.aborted).toBe(true);
    const controller = new AbortController();
    const cancelled = client.getInstance({ signal: controller.signal });
    controller.abort("caller secret");
    await expect(cancelled).rejects.toMatchObject({ category: "cancelled" });
    expect(transport.mock.calls[1]![1].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not start already-cancelled work", async () => {
    const { client, transport } = setup(() => Response.json(instance));
    await expect(client.getInstance({ signal: AbortSignal.abort() })).rejects.toMatchObject({
      category: "cancelled",
    });
    expect(transport).not.toHaveBeenCalled();
  });

  it("includes stalled response bodies in the deadline", async () => {
    const { client } = setup(
      () =>
        new Response(new ReadableStream({ start() {} }), {
          headers: { "Content-Type": "application/json" },
        }),
    );
    await expect(client.getInstance({ timeoutMs: 10 })).rejects.toMatchObject({
      category: "timeout",
    });
  });

  it("isolates concurrent servers/tokens and late completion after abort", async () => {
    let finish: (response: Response) => void = () => {};
    const first = setup(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const otherTransport = vi.fn<HttpTransport>(async () => Response.json(instance));
    const other = new ApiClient({ baseUrl: "https://other.test/", transport: otherTransport });
    const controller = new AbortController();
    const request = first.client.request({
      method: "GET",
      path: ["fixture"],
      accessToken: "first",
      signal: controller.signal,
      decode: decodeInstance,
    });
    controller.abort();
    await expect(request).rejects.toMatchObject({ category: "cancelled" });
    await other.request({
      method: "GET",
      path: ["fixture"],
      accessToken: "second",
      decode: decodeInstance,
    });
    finish(Response.json(instance));
    await other.getInstance();
    expect(first.transport.mock.calls[0]![1].headers.get("Authorization")).toBe("Bearer first");
    expect(otherTransport.mock.calls[0]![0].origin).toBe("https://other.test");
    expect(otherTransport.mock.calls[0]![1].headers.get("Authorization")).toBe("Bearer second");
    expect(otherTransport.mock.calls[1]![1].headers.has("Authorization")).toBe(false);
  });
});
