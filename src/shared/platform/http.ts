import type { HttpTransport } from "../api/transport";
import { browserHttp } from "./browser-http";

export async function platformHttp(): Promise<HttpTransport> {
  // Same injected marker used by @tauri-apps/api's isTauri(). Unlike a user agent
  // or dev hostname, it is also present in installed desktop/Android builds.
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    return (await import("./tauri-http")).tauriHttp;
  }
  return browserHttp;
}
