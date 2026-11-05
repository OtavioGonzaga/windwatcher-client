import type { HttpTransport } from "../api/transport";

/** Uses browser security unchanged: no proxy, credentials or redirect following. */
export const browserHttp: HttpTransport = (url, request) =>
  globalThis.fetch(url, { ...request, credentials: "omit", redirect: "manual" });
