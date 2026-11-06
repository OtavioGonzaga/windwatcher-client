import { afterEach, describe, expect, it, vi } from "vitest";
import { canDiscoverLocalServer } from "./native-target";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("local discovery platform gate", () => {
  it.each(["web", "linux", "windows", "android", "unknown"])(
    "never scans a browser (%s output)",
    (target) => {
      vi.stubEnv("NATIVE_TARGET", target);
      vi.stubGlobal("isTauri", false);
      expect(canDiscoverLocalServer()).toBe(false);
    },
  );
  it.each(["web", "linux", "windows", "android", "unknown"])(
    "requires native Linux (%s output)",
    (target) => {
      vi.stubEnv("NATIVE_TARGET", target);
      vi.stubGlobal("isTauri", true);
      expect(canDiscoverLocalServer()).toBe(target === "linux");
    },
  );
});
