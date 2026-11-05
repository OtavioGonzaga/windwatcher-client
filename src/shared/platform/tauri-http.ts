import { fetch as nativeFetch } from "@tauri-apps/plugin-http";
import type { HttpTransport } from "../api/transport";

/** No cookie jar or dangerous TLS features are enabled in the Rust host. */
export const tauriHttp: HttpTransport = (url, request) =>
  nativeFetch(url, {
    ...request,
    headers: new Headers(request.headers),
    credentials: "omit",
    maxRedirections: 0,
  });
