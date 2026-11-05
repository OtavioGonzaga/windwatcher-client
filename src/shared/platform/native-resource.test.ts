import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { tauriHttp } from "./tauri-http";

const ipc = {
  invoke: vi.fn<(command: string, args?: unknown, options?: unknown) => Promise<unknown>>(),
};
beforeEach(() => vi.stubGlobal("__TAURI_INTERNALS__", ipc));
afterEach(() => {
  vi.unstubAllGlobals();
  ipc.invoke.mockReset();
});

it.each([204, 205, 304])(
  "releases the actual plugin's Rust response resource for HTTP %s",
  async (status) => {
    ipc.invoke
      .mockResolvedValueOnce(11)
      .mockResolvedValueOnce({
        status,
        statusText: "",
        url: "http://example.test/v1/fixture",
        headers: [],
        rid: 22,
      })
      .mockResolvedValueOnce(undefined);
    const response = await tauriHttp(new URL("http://example.test/v1/fixture"), {
      method: "GET",
      headers: new Headers(),
      signal: new AbortController().signal,
    });
    expect(response.body).toBeNull();
    expect(response.status).toBe(status);
    expect(ipc.invoke).toHaveBeenCalledWith(
      "plugin:http|fetch_cancel_body",
      { rid: 22 },
      undefined,
    );
    expect(ipc.invoke).toHaveBeenCalledTimes(3);
  },
);
