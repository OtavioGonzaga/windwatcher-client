import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "./client";
import type { HttpTransport } from "./transport";

describe("operation idempotency header", () => {
  it.each(["", " ", " x", "x ", "a\nb", "é", "x".repeat(129)])(
    "rejects malformed key before I/O",
    async (idempotencyKey) => {
      const transport = vi.fn<HttpTransport>();
      const client = new ApiClient({ baseUrl: "https://example.test/", transport });
      await expect(
        client.request({
          method: "POST",
          path: ["conversations"],
          expectedStatuses: [200],
          idempotencyKey,
          decode: (value) => value,
        }),
      ).rejects.toBeInstanceOf(TypeError);
      expect(transport).not.toHaveBeenCalled();
    },
  );
  it("preserves one key through a proxy-prefixed POST and omits it from GET", async () => {
    const transport = vi.fn<HttpTransport>(async () => Response.json({}));
    const client = new ApiClient({ baseUrl: "https://example.test/proxy/", transport });
    await client.request({
      method: "POST",
      path: ["conversations"],
      expectedStatuses: [200],
      idempotencyKey: "!Exact-Key~",
      body: { kind: "direct" },
      decode: (value) => value,
    });
    const [url, init] = transport.mock.calls[0]!;
    expect(url.pathname).toBe("/proxy/v1/conversations");
    expect([...new Headers(init.headers)].filter(([name]) => name === "idempotency-key")).toEqual([
      ["idempotency-key", "!Exact-Key~"],
    ]);
    await client.getInstance().catch(() => {});
    expect(new Headers(transport.mock.calls[1]![1].headers).has("Idempotency-Key")).toBe(false);
    await expect(
      client.request({
        method: "GET",
        path: ["users"],
        expectedStatuses: [200],
        idempotencyKey: "invalid-on-get",
        decode: (value) => value,
      }),
    ).rejects.toBeInstanceOf(TypeError);
    expect(transport).toHaveBeenCalledTimes(2);
  });
});
