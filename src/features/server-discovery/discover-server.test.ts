import { describe, expect, it, vi } from "vitest";
import { discoverServer } from "./discover-server";
import type { HttpTransport } from "../../shared/api/transport";
import { instance, problem } from "../../../tests/fixtures/instance";

const root = "https://example.test/proxy/";
const signal = new AbortController().signal;
describe("server discovery policy", () => {
  it.each([
    [
      {
        ...instance,
        registration: "open",
        api_versions: ["v1", "v2"],
        auth_methods: ["password", "future"],
      },
      "supported",
    ],
    [{ ...instance, registration: "closed" }, "supported"],
    [{ ...instance, service: "other" }, "wrong-service"],
    [{ ...instance, api_versions: ["v2"] }, "unsupported-api"],
    [{ ...instance, auth_methods: [] }, "unsupported-auth"],
  ])("classifies capabilities without rejecting additions", async (metadata, kind) => {
    const transport: HttpTransport = async () => Response.json(metadata);
    await expect(discoverServer(root, transport, signal)).resolves.toMatchObject({ kind, root });
  });
  it("only uses a same-root unauthenticated v1 clue after explicit absence", async () => {
    const transport = vi.fn<HttpTransport>(async (url, options) => {
      expect(options.headers.get("Authorization")).toBeNull();
      if (url.pathname.endsWith("/instance")) return new Response("missing", { status: 404 });
      expect(url.href).toBe("https://example.test/proxy/v1/users/me");
      return Response.json(problem(401, "auth.invalid_access_token"), { status: 401 });
    });
    await expect(discoverServer(root, transport, signal)).resolves.toEqual({
      kind: "legacy",
      root,
      recognized: true,
    });
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it("does not upgrade probe failures to compatibility", async () => {
    const transport = vi
      .fn<HttpTransport>()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockRejectedValueOnce(new Error("offline"));
    await expect(discoverServer(root, transport, signal)).rejects.toMatchObject({
      category: "transport",
    });
  });
});
