import { describe, expect, it, vi } from "vitest";
import { DirectOperation, directFailure } from "./direct-operation";
import { ApiError } from "../../shared/api/error";

const user = { id: "019a0000-0000-7000-8000-000000000001", username: "alice" };
describe("form-scoped Direct operation", () => {
  it("keeps target/key for explicit retry, expires at 24 hours and never silently replaces it", async () => {
    const op = new DirectOperation(user, 100);
    const send = vi.fn(async () => "ok");
    await op.dispatch(send, 100);
    await op.dispatch(send, 200);
    expect(send.mock.calls[0]).toEqual(send.mock.calls[1]);
    expect(op.eligible(100 + 86400_000)).toBe(false);
    await expect(op.dispatch(send, 100 + 86400_000)).rejects.toThrow();
    expect(send).toHaveBeenCalledTimes(2);
    const next = new DirectOperation(user, 200);
    await next.dispatch(send, 200);
    expect(send.mock.calls[2]).not.toEqual(send.mock.calls[0]);
    op.stop();
    expect(op.eligible(200)).toBe(false);
  });
  it.each(["timeout", "transport", "invalid-response", "cancelled"] as const)(
    "classifies %s after POST as ambiguous",
    (category) => {
      expect(directFailure(new ApiError(category), true).kind).toBe("ambiguous");
    },
  );
});
