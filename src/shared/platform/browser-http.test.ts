import { afterEach, expect, it, vi } from "vitest";
import { browserHttp } from "./browser-http";

afterEach(() => vi.unstubAllGlobals());
it("pins browser credentials and redirect policy", async () => {
  const fetch = vi.fn(async () => new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetch);
  const request = {
    method: "GET" as const,
    headers: new Headers(),
    signal: new AbortController().signal,
  };
  await browserHttp(new URL("http://example.test/"), request);
  expect(fetch).toHaveBeenCalledWith(new URL("http://example.test/"), {
    ...request,
    credentials: "omit",
    redirect: "manual",
  });
});
