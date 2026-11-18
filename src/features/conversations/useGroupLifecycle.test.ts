import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../shared/api/error";
import { useGroupLifecycle } from "./useGroupLifecycle";
import type { LifecycleOwner } from "./useGroupLifecycle";
import type { Conversation } from "./validation";
import type { GroupAction } from "./group-lifecycle";

const group: Conversation = {
  id: "group",
  title: "Exact",
  kind: "group",
  membership: { role: "owner" },
  unread_count: 0,
  created_at: "2026-11-06T12:00:00Z",
  updated_at: "2026-11-06T12:00:00Z",
};
const context = {
  profileId: "profile",
  accountId: "account",
  userId: "owner",
  epoch: 1,
  signal: new AbortController().signal,
};
const target = {
  user: { id: "target", username: "peer" },
  role: "member" as const,
  joined_at: group.created_at,
};
const actions: GroupAction[] = [
  { kind: "rename", title: "Exact" },
  { kind: "add", target: target.user },
  { kind: "role", target, role: "admin" },
  { kind: "remove", target },
  { kind: "transfer", target },
  { kind: "leave", destructive: false },
];
const owner = {
  getConversation: vi.fn(),
  listGroupMembers: vi.fn(),
  isCurrent: vi.fn(),
  renameGroup: vi.fn(),
  addGroupMember: vi.fn(),
  changeGroupMemberRole: vi.fn(),
  removeGroupMember: vi.fn(),
  transferGroupOwner: vi.fn(),
  leaveGroup: vi.fn(),
} satisfies LifecycleOwner;
const methods = () => [
  owner.renameGroup,
  owner.addGroupMember,
  owner.changeGroupMemberRole,
  owner.removeGroupMember,
  owner.transferGroupOwner,
  owner.leaveGroup,
];
const onSummary = vi.fn(),
  onUnavailable = vi.fn(),
  onLeft = vi.fn();
function mount() {
  return renderHook(() =>
    useGroupLifecycle({ owner, context, group, onSummary, onUnavailable, onLeft }),
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  owner.isCurrent.mockResolvedValue(true);
  owner.getConversation.mockResolvedValue(group);
  owner.listGroupMembers.mockResolvedValue({ items: [target], has_more: false });
  methods().forEach((method) => method.mockResolvedValue(undefined));
});
describe("non-replayable Group lifecycle", () => {
  it.each(actions)(
    "$kind preserves ambiguity until explicit authoritative check",
    async (action) => {
      methods().forEach((method) => method.mockRejectedValue(new ApiError("transport")));
      const { result } = mount();
      act(() => result.current.begin(action));
      await act(async () => result.current.send());
      expect(result.current.state.outcome).toBe("ambiguous");
      expect(owner.getConversation).not.toHaveBeenCalled();
      act(() => result.current.begin({ kind: "rename", title: "Other" }));
      await act(async () => result.current.send());
      expect(methods().reduce((n, method) => n + method.mock.calls.length, 0)).toBe(1);
      await act(async () => result.current.check());
      expect(result.current.state.outcome).toBe("ambiguous");
      expect(result.current.state.verification).toBeDefined();
      expect(methods().reduce((n, method) => n + method.mock.calls.length, 0)).toBe(1);
    },
  );
  it("retains confirmed write when the following GET fails and disables new actions", async () => {
    owner.getConversation.mockRejectedValue(new ApiError("transport"));
    const { result } = mount();
    act(() => result.current.begin(actions[0]!));
    await act(async () => result.current.send());
    expect(result.current.state).toMatchObject({ outcome: "confirmed", verification: "failed" });
    expect(result.current.verified).toBe(false);
    act(() => result.current.finish());
    expect(result.current.state.phase).toBe("result");
    owner.getConversation.mockResolvedValue(group);
    await act(async () => result.current.check());
    act(() => result.current.finish());
    expect(result.current.state.phase).toBe("idle");
  });
  it("refreshes a permission rejection without clearing readable membership", async () => {
    owner.renameGroup.mockRejectedValue(
      new ApiError("http", { status: 403, code: "conversation.insufficient_permissions" }),
    );
    owner.getConversation.mockResolvedValue({ ...group, membership: { role: "member" } });
    const { result } = mount();
    act(() => result.current.begin(actions[0]!));
    await act(async () => result.current.send());
    expect(result.current.state).toMatchObject({ outcome: "rejected", failure: "permission" });
    expect(onSummary).toHaveBeenCalledWith(
      expect.objectContaining({ membership: { role: "member" } }),
    );
    expect(onUnavailable).not.toHaveBeenCalled();
  });
  it("coalesces double confirmation and fences completion after unmount", async () => {
    let finish!: () => void;
    owner.renameGroup.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const { result, unmount } = mount();
    act(() => result.current.begin(actions[0]!));
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.send();
      void result.current.send();
    });
    expect(owner.renameGroup).toHaveBeenCalledTimes(1);
    unmount();
    await act(async () => {
      finish();
      await pending;
    });
    expect(onSummary).not.toHaveBeenCalled();
    expect(onLeft).not.toHaveBeenCalled();
  });
  it("uses cooldown without resending or automatically reading", async () => {
    owner.renameGroup.mockRejectedValue(
      new ApiError("http", { status: 429, code: "rate_limit.exceeded", retryAfterMs: 50 }),
    );
    const { result } = mount();
    act(() => result.current.begin(actions[0]!));
    await act(async () => result.current.send());
    expect(result.current.cooldown.waiting).toBe(true);
    await act(async () => result.current.check());
    expect(owner.getConversation).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.cooldown.waiting).toBe(false));
    expect(owner.renameGroup).toHaveBeenCalledTimes(1);
  });
});
