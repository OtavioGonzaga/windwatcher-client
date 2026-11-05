import { afterEach, describe, expect, it, vi } from "vitest";
import { fetch } from "@tauri-apps/plugin-http";
import { browserHttp } from "./browser-http";
import { platformHttp } from "./http";
import { tauriHttp } from "./tauri-http";

vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn(async () => Response.json({})) }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("platform network selection", () => {
  it("uses browser fetch when native IPC is absent", async () => {
    expect(await platformHttp()).toBe(browserHttp);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("selects native HTTP from the installed-host marker", async () => {
    vi.stubGlobal("__TAURI_INTERNALS__", {});
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
