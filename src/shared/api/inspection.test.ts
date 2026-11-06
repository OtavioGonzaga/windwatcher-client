import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "./client";
import type { HttpTransport } from "./transport";
import { problem, requestId } from "../../../tests/fixtures/instance";

function client(make: () => Response) {
  const transport = vi.fn<HttpTransport>(async () => make());
  return { api: new ApiClient({ baseUrl: "https://example.org/proxy/", transport }), transport };
}

describe("bounded discovery inspection", () => {
  it.each([
    () => new Response(null, { status: 204 }),
    () => new Response(null, { status: 200 }),
    () =>
      new Response("<h1>not found</h1>", { status: 404, headers: { "Content-Type": "text/html" } }),
  ])("recognizes explicit absence without changing strict discovery", async (make) => {
    const { api, transport } = client(make);
    await expect(api.inspectInstance()).resolves.toEqual({ kind: "absent" });
    await expect(api.getInstance()).rejects.toMatchObject({ category: "invalid-response" });
    expect(transport.mock.calls[0]?.[0].href).toBe("https://example.org/proxy/v1/instance");
    expect(transport.mock.calls[0]?.[1].headers.get("Authorization")).toBeNull();
  });
  it.each([" ", "\uFEFF", "{}", "null", "[]", "<html>"])(
    "rejects nonempty invalid metadata %s",
    async (body) => {
      const { api } = client(
        () => new Response(body, { headers: { "Content-Type": "application/json" } }),
      );
      await expect(api.inspectInstance()).rejects.toMatchObject({ category: "invalid-response" });
    },
  );
  it("returns structurally valid foreign metadata without weakening getInstance", async () => {
    const metadata = {
      service: "other",
      registration: "open",
      api_versions: ["v1"],
      auth_methods: ["password"],
    };
    const { api } = client(() => Response.json(metadata));
    await expect(api.inspectInstance()).resolves.toEqual({ kind: "metadata", metadata });
    await expect(api.getInstance()).rejects.toMatchObject({ category: "invalid-response" });
  });
  it("recognizes a typed 404 without identifying its service", async () => {
    const { api } = client(() => Response.json(problem(404, "request.not_found"), { status: 404 }));
    await expect(api.inspectInstance()).resolves.toEqual({ kind: "absent" });
  });
  it.each([401, 403, 429, 500])(
    "retains safe HTTP %s diagnostics without legacy fallback",
    async (status) => {
      const { api } = client(() =>
        Response.json(problem(status), {
          status,
          headers: { "X-Request-Id": requestId, "Retry-After": "3" },
        }),
      );
      await expect(api.inspectInstance()).rejects.toMatchObject({
        category: "http",
        metadata: { status, requestId, retryAfterMs: 3000 },
      });
    },
  );
  it("rejects oversized 404 and malformed successful media", async () => {
    const oversized = client(
      () =>
        new Response("x".repeat(65537), { status: 404, headers: { "Content-Type": "text/html" } }),
    );
    await expect(oversized.api.inspectInstance()).rejects.toMatchObject({
      category: "response-too-large",
    });
    const html = client(
      () =>
        new Response("<html>not an instance</html>", { headers: { "Content-Type": "text/html" } }),
    );
    await expect(html.api.inspectInstance()).rejects.toMatchObject({
      category: "invalid-response",
    });
  });
});
