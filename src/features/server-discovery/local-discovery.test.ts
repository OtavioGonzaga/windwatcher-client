import { afterEach, describe, expect, it, vi } from "vitest";
import type { HttpTransport } from "../../shared/api/transport";
import { instance, problem } from "../../../tests/fixtures/instance";
import { discoverLocalServers } from "./local-discovery";

afterEach(() => vi.useRealTimers());
const scan = (transport: HttpTransport) =>
  discoverLocalServers(transport, new AbortController().signal, () => {});
describe("fixed, identity-first local discovery", () => {
  it("checks exactly two distinct roots, only public GET, instance before health", async () => {
    const paths = new Map<string, string[]>();
    const transport = vi.fn<HttpTransport>(async (url, request) => {
      expect(request.method).toBe("GET");
      expect([...request.headers]).toEqual([["accept", "application/json"]]);
      expect(request.body).toBeUndefined();
      const seen = paths.get(url.origin) ?? [];
      seen.push(url.pathname);
      paths.set(url.origin, seen);
      return Response.json(url.pathname === "/v1/instance" ? instance : { status: "ready" });
    });
    expect(await scan(transport)).toEqual([
      { root: "http://127.0.0.1:8080/", kind: "supported", readiness: "ready" },
      { root: "http://[::1]:8080/", kind: "supported", readiness: "ready" },
    ]);
    expect([...paths]).toEqual([
      ["http://127.0.0.1:8080", ["/v1/instance", "/health/ready"]],
      ["http://[::1]:8080", ["/v1/instance", "/health/ready"]],
    ]);
    expect(transport).toHaveBeenCalledTimes(4);
  });
  it.each([
    [200, { status: "ready" }, "application/json", "ready"],
    [503, { status: "not_ready" }, "application/json; charset=utf-8", "not-ready"],
    [200, { status: "not_ready" }, "application/json", "unknown"],
    [503, { status: "ready" }, "application/json", "unknown"],
    [404, { status: "ready" }, "application/json", "unknown"],
    [302, { status: "ready" }, "application/json", "unknown"],
    [503, "<html>unavailable</html>", "text/html", "unknown"],
    [200, { status: "ready" }, "application/problem+json", "unknown"],
    [200, { other: "ready" }, "application/json", "unknown"],
    [200, "{", "application/json", "unknown"],
    [200, "x".repeat(4097), "application/json", "unknown"],
  ])(
    "requires exact health status/body and JSON (%s, %j)",
    async (status, body, media, readiness) => {
      const transport: HttpTransport = async (url) =>
        url.pathname === "/v1/instance"
          ? Response.json(instance)
          : new Response(typeof body === "string" ? body : JSON.stringify(body), {
              status,
              headers: { "Content-Type": media },
            });
      expect(await scan(transport)).toMatchObject([{ readiness }, { readiness }]);
    },
  );
  it.each([
    [{ ...instance, service: "foreign" }, "wrong-service"],
    [{ ...instance, api_versions: ["v2"] }, "unsupported-api"],
    [{ ...instance, auth_methods: [] }, "unsupported-auth"],
    [{ service: "windwatcher" }, "failed"],
  ])("never queries health without supported identity/capabilities", async (body, kind) => {
    const transport = vi.fn<HttpTransport>(async () => Response.json(body));
    expect(await scan(transport)).toMatchObject([{ kind }, { kind }]);
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it.each([204, 200, 404])(
    "only exact legacy corroboration is offered after %s absence",
    async (status) => {
      const transport: HttpTransport = async (url) => {
        if (url.pathname === "/v1/instance") return new Response(null, { status });
        expect(url.pathname).toBe("/v1/users/me");
        return url.hostname === "127.0.0.1"
          ? Response.json(problem(401, "auth.invalid_access_token"), { status: 401 })
          : new Response(null, { status: 404 });
      };
      expect(await scan(transport)).toMatchObject([{ kind: "legacy" }, { kind: "unknown" }]);
    },
  );
  it.each(["127.0.0.1", "[::1]"])(
    "reports the healthy peer without waiting for hanging %s",
    async (host) => {
      vi.useFakeTimers();
      const notify = vi.fn();
      const transport = vi.fn<HttpTransport>(async (url) => {
        if (url.hostname === host) return new Promise(() => {});
        return Response.json(url.pathname === "/v1/instance" ? instance : { status: "ready" });
      });
      const pending = discoverLocalServers(transport, new AbortController().signal, notify);
      await vi.advanceTimersByTimeAsync(1);
      expect(notify).toHaveBeenCalledWith(expect.objectContaining({ readiness: "ready" }));
      await vi.advanceTimersByTimeAsync(2999);
      expect(await pending).toEqual(
        expect.arrayContaining([expect.objectContaining({ kind: "failed", category: "timeout" })]),
      );
      expect(transport).toHaveBeenCalledTimes(3);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it("bounds the complete legacy inspection, not only its first request", async () => {
    vi.useFakeTimers();
    const transport = vi.fn<HttpTransport>(async (url) =>
      url.pathname === "/v1/instance" ? new Response(null, { status: 204 }) : new Promise(() => {}),
    );
    const pending = scan(transport);
    await vi.advanceTimersByTimeAsync(3000);
    expect(await pending).toMatchObject([
      { kind: "failed", category: "timeout" },
      { kind: "failed", category: "timeout" },
    ]);
    expect(transport).toHaveBeenCalledTimes(4);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("caps hanging readiness bodies and cancels their streams", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const transport: HttpTransport = async (url) =>
      url.pathname === "/v1/instance"
        ? Response.json(instance)
        : new Response(new ReadableStream({ cancel }), {
            headers: { "Content-Type": "application/json" },
          });
    const pending = scan(transport);
    await vi.advanceTimersByTimeAsync(6000);
    expect(await pending).toMatchObject([{ readiness: "unknown" }, { readiness: "unknown" }]);
    expect(cancel).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("bounds oversized metadata and cancels oversized health streams", async () => {
    const cancel = vi.fn();
    const transport: HttpTransport = async (url) => {
      if (url.hostname === "[::1]") return Response.json({ data: "x".repeat(65537) });
      if (url.pathname === "/v1/instance") return Response.json(instance);
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(4097));
          },
          cancel,
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    };
    expect(await scan(transport)).toMatchObject([
      { readiness: "unknown" },
      { kind: "failed", category: "response-too-large" },
    ]);
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("aborts both probes, releases timers and rejects without late callbacks", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const notify = vi.fn();
    const requests: AbortSignal[] = [];
    const transport: HttpTransport = async (_url, request) => {
      requests.push(request.signal);
      return new Promise(() => {});
    };
    const pending = discoverLocalServers(transport, controller.signal, notify);
    const rejected = expect(pending).rejects.toMatchObject({ category: "cancelled" });
    await vi.advanceTimersByTimeAsync(1);
    controller.abort();
    await rejected;
    await vi.advanceTimersByTimeAsync(10000);
    expect(requests).toHaveLength(2);
    expect(requests.every((signal) => signal.aborted)).toBe(true);
    expect(notify).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
