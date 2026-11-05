import { describe, expect, it } from "vitest";
import { ApiError, retryAfterMs } from "./error";

describe("failure metadata", () => {
  it.each([null, "", "-1", "1.5", "tomorrow", "Infinity", "999999999999999999999"])(
    "rejects invalid Retry-After %s",
    (value) => {
      expect(retryAfterMs(value)).toBeUndefined();
    },
  );
  it("supports seconds, HTTP-date and already elapsed dates", () => {
    const now = Date.parse("Thu, 05 Nov 2026 12:00:00 GMT");
    expect(retryAfterMs("0", now)).toBe(0);
    expect(retryAfterMs(" 12 ", now)).toBe(12000);
    expect(retryAfterMs("Thu, 05 Nov 2026 12:00:30 GMT", now)).toBe(30000);
    expect(retryAfterMs("Thu, 05 Nov 2026 11:00:00 GMT", now)).toBe(0);
  });
  it("copies and freezes metadata", () => {
    const source = { status: 401 };
    const error = new ApiError("http", source);
    source.status = 500;
    expect(error.metadata.status).toBe(401);
    expect(Object.isFrozen(error.metadata)).toBe(true);
  });
});
