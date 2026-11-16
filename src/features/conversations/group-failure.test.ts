import { describe, expect, it } from "vitest";
import { ApiError } from "../../shared/api/error";
import { groupFailure } from "./group-failure";

describe("Group failure classification", () => {
  it.each([
    [422, "conversation.invalid_title", "invalidTitle"],
    [422, "conversation.too_many_participants", "tooMany"],
    [422, "conversation.participant_unavailable", "participant"],
    [409, "idempotency.key_reused", "conflict"],
    [409, "idempotency.result_unavailable", "resultUnavailable"],
    [401, "auth.invalid_access_token", "session"],
  ] as const)("classifies verified HTTP %s/%s", (status, code, kind) => {
    expect(groupFailure(new ApiError("http", { status, code }))).toEqual({ kind, terminal: true });
  });
  it.each([
    "transport",
    "timeout",
    "cancelled",
    "redirect",
    "invalid-response",
    "response-too-large",
  ] as const)("treats %s after invocation as ambiguous", (category) => {
    expect(groupFailure(new ApiError(category))).toEqual({ kind: "ambiguous", terminal: false });
  });
  it("does not trust a semantic code under the wrong HTTP status", () => {
    expect(
      groupFailure(new ApiError("http", { status: 500, code: "conversation.invalid_title" })).kind,
    ).toBe("ambiguous");
  });
});
