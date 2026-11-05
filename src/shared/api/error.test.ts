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
    expect(retryAfterMs("Thursday, 05-Nov-26 12:00:30 GMT", now)).toBe(30000);
    expect(retryAfterMs("Thu Nov  5 12:00:30 2026", now)).toBe(30000);
    expect(retryAfterMs("Thu, 31 Feb 2026 12:00:00 GMT", now)).toBeUndefined();
    expect(retryAfterMs("Fri, 05 Nov 2026 12:00:00 GMT", now)).toBeUndefined();
    const future = new Date(Date.UTC(2060, 10, 5, 12, 0, 0));
    expect(retryAfterMs("Friday, 05-Nov-60 12:00:00 GMT", now)).toBe(future.getTime() - now);
  });
  it("copies and freezes metadata", () => {
    const source = { status: 401 };
    const error = new ApiError("http", source);
    source.status = 500;
    expect(error.metadata.status).toBe(401);
    expect(Object.isFrozen(error.metadata)).toBe(true);
  });
});
