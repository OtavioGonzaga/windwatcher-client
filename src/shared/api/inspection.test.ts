import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "./client";
import type { HttpTransport } from "./transport";

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
});
