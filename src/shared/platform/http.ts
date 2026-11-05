import type { HttpTransport } from "../api/transport";
import { browserHttp } from "./browser-http";

export async function platformHttp(): Promise<HttpTransport> {
  // Same injected flag used by @tauri-apps/api 2.12.4's isTauri(). Unlike a user
  // agent or dev hostname, it is present in installed desktop/Android builds.
  if (Reflect.get(globalThis, "isTauri") === true) {
    return (await import("./tauri-http")).tauriHttp;
  }
  return browserHttp;
}
