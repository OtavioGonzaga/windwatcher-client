import { describe, expect, it } from "vitest";
import { errorKey } from "./error-key";
import type { SessionError } from "./service";

describe("safe authentication error messages", () => {
  it.each([
    ["registration-closed", "registrationClosed"],
    ["network", "network"],
    ["timeout", "timeout"],
    ["redirect", "redirect"],
    ["rate-limited", "rate-limited"],
    ["server", "server"],
    ["storage-locked", "locked"],
    ["storage-unavailable", "storage"],
    ["invalid-refresh", "session"],
  ] as const)("maps %s without exposing underlying messages", (category: SessionError, key) => {
    expect(errorKey(category)).toBe(key);
  });
});
