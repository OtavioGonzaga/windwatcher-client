import { isTauri } from "@tauri-apps/api/core";

/** Behavioral gate, not an authorization boundary. Never infer this from a UA. */
export function canDiscoverLocalServer(): boolean {
  return isTauri() && import.meta.env.NATIVE_TARGET === "linux";
}
