import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../shared/api/error";
import { groupIntent, lifecycleFailure, reconcileGroup, soleOwner } from "./group-lifecycle";
import type { GroupAction } from "./group-lifecycle";
import type { Conversation } from "./validation";
import type { Member } from "./group-validation";
const context = {
  profileId: "profile",
  accountId: "account",
  userId: "actor",
  epoch: 1,
  signal: new AbortController().signal,
};
const group: Conversation = {
  id: "group",
  title: "Current",
  kind: "group",
  membership: { role: "owner" },
  unread_count: 0,
  created_at: "2026-11-06T12:00:00Z",
  updated_at: "2026-11-06T12:00:00Z",
};
const target: Member = {
  user: { id: "target", username: "bob" },
  role: "member",
  joined_at: group.created_at,
};
describe("Group lifecycle reconciliation", () => {
  it.each([
    [403, "conversation.insufficient_permissions", "permission"],
    [404, "conversation.not_found", "unavailable"],
    [404, "conversation.member_not_found", "targetMissing"],
    [409, "conversation.owner_protected", "ownerProtected"],
    [409, "conversation.ownership_transfer_required", "transferRequired"],
    [422, "conversation.participant_unavailable", "participant"],
    [500, "conversation.owner_protected", "ambiguous"],
  ] as const)("classifies %s/%s by verified status and code", (status, code, kind) => {
    expect(lifecycleFailure(new ApiError("http", { status, code })).kind).toBe(kind);
    expect(lifecycleFailure(new ApiError("invalid-response", { status, code })).kind).toBe(
      "ambiguous",
    );
  });
  it("captures immutable nonsecret input without freezing the caller's objects", () => {
    const intent = groupIntent(context, group, { kind: "remove", target });
    expect(Object.isFrozen(intent)).toBe(true);
    expect("signal" in intent.scope).toBe(false);
    expect(Object.isFrozen(target)).toBe(false);
    expect(Object.isFrozen(intent.action)).toBe(true);
  });
  it.each([
    { kind: "rename", title: "Current" },
    { kind: "add", target: target.user },
    { kind: "role", target, role: "member" },
    { kind: "transfer", target },
    { kind: "remove", target },
  ] satisfies GroupAction[])(
    "compares current observations for $kind without claiming causality",
    async (action) => {
      const reader = {
        getConversation: vi.fn(async () => group),
        listGroupMembers: vi.fn(async () => ({ items: [target], has_more: false })),
      };
      const result = await reconcileGroup(
        reader,
        context,
        groupIntent(context, group, action),
        context.signal,
      );
      expect(result.result).toBe(
        ["remove", "transfer"].includes(action.kind) ? "differs" : "matches",
      );
    },
  );
  it("only establishes observed absence after exhausting the bounded traversal", async () => {
    const reader = {
      getConversation: vi.fn(async () => group),
      listGroupMembers: vi.fn(async () => ({
        items: [{ ...target, user: { ...target.user, id: "other" } }],
        has_more: true,
        next_cursor: crypto.randomUUID(),
      })),
    };
    const result = await reconcileGroup(
      reader,
      context,
      groupIntent(context, group, { kind: "remove", target }),
      context.signal,
    );
    expect(result.result).toBe("unverified");
    expect(reader.listGroupMembers).toHaveBeenCalledTimes(10);
    reader.listGroupMembers.mockResolvedValueOnce({
      items: [],
      has_more: false,
      next_cursor: crypto.randomUUID(),
    });
    // Empty first page is inconsistent for a Group with a current actor.
    await expect(
      reconcileGroup(
        reader,
        context,
        groupIntent(context, group, { kind: "remove", target }),
        context.signal,
      ),
    ).rejects.toThrow();
  });
  it("finds targets beyond page one, rejects cyclic cursors and handles access loss", async () => {
    const reader = {
      getConversation: vi.fn(async () => group),
      listGroupMembers: vi
        .fn()
        .mockResolvedValueOnce({
          items: [{ ...target, user: { ...target.user, id: "other" } }],
          has_more: true,
          next_cursor: "next",
        })
        .mockResolvedValueOnce({ items: [target], has_more: false }),
    };
    expect(
      (
        await reconcileGroup(
          reader,
          context,
          groupIntent(context, group, { kind: "add", target: target.user }),
          context.signal,
        )
      ).result,
    ).toBe("matches");
    reader.getConversation.mockRejectedValueOnce(
      new ApiError("http", { status: 404, code: "conversation.not_found" }),
    );
    expect(
      (
        await reconcileGroup(
          reader,
          context,
          groupIntent(context, group, { kind: "leave", destructive: true }),
          context.signal,
        )
      ).result,
    ).toBe("noAccess");
    reader.listGroupMembers.mockResolvedValue({
      items: [{ ...target, user: { ...target.user, id: "other" } }],
      has_more: true,
      next_cursor: "cycle",
    });
    await expect(
      reconcileGroup(
        reader,
        context,
        groupIntent(context, group, { kind: "remove", target }),
        context.signal,
      ),
    ).rejects.toThrow();
  });
  it("requires exactly the actor's Owner row and complete fresh evidence for deletion", () => {
    const row = { ...target, user: { ...target.user, id: "actor" }, role: "owner" as const };
    expect(soleOwner(group, "actor", { items: [row], has_more: false })).toBe(true);
    expect(soleOwner(group, "actor", { items: [row], has_more: true, next_cursor: "next" })).toBe(
      false,
    );
    expect(soleOwner(group, "actor", { items: [row, target], has_more: false })).toBe(false);
    expect(soleOwner(group, "actor", { items: [target], has_more: false })).toBe(false);
  });
});
