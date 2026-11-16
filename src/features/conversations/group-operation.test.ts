import { describe, expect, it, vi } from "vitest";
import { GroupOperation } from "./group-operation";
import { groupDraft, groupTitleIssue } from "./group-validation";

const id = (n: number) => `019a0000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;
const scope = { profileId: "profile", accountId: "account", userId: id(1), epoch: 1 };
describe("Group draft and operation", () => {
  it("fails closed on invalid clock, rollback or expiration without silently renewing the window", () => {
    expect(() => new GroupOperation(scope, "Group", [], NaN)).toThrow();
    const op = new GroupOperation(scope, "Group", [], 100);
    expect(op.eligible(200)).toBe(true);
    expect(op.eligible(199)).toBe(false);
    expect(op.eligible(201)).toBe(false);
    const expired = new GroupOperation(scope, "Group", [], 100);
    expect(expired.eligible(100 + 86400_000)).toBe(false);
    expect(expired.eligible(100)).toBe(false);
  });
  it.each(["", " \t\n", "\u0085", "\u2003"])("rejects Rust whitespace-only titles", (title) => {
    expect(groupTitleIssue(title)).toBe("blank");
  });
  it("preserves exact Unicode bytes without JS trim or surrogate replacement", () => {
    expect(groupTitleIssue("\ufeff")).toBeUndefined();
    expect(groupTitleIssue("\ud800")).toBe("unicode");
    expect(groupTitleIssue("😀".repeat(64))).toBeUndefined();
    expect(groupTitleIssue("😀".repeat(64) + "x")).toBe("long");
    expect(groupDraft("  é 😀  ", [], scope.userId).title).toBe("  é 😀  ");
  });
  it("sorts distinct peers, excludes owner and rejects overflow without truncation", () => {
    expect(groupDraft("Group", [id(3), id(1), id(2), id(2)], id(1)).participant_ids).toEqual([
      id(2),
      id(3),
    ]);
    const ids = Array.from({ length: 256 }, (_, n) => id(n + 2));
    expect(groupDraft("Group", ids, id(1)).participant_ids).toHaveLength(256);
    expect(() => groupDraft("Group", [...ids, id(300)], id(1))).toThrow();
    expect(ids).toHaveLength(256);
  });
  it("freezes scope/body/key across retries and refuses old or changed contexts", async () => {
    const ids = [id(2)];
    const op = new GroupOperation(scope, " exact ", ids, 100);
    ids.push(id(3));
    const send = vi.fn(async () => "ok");
    await op.dispatch(scope, send, 100);
    await op.dispatch(scope, send, 101);
    expect(send.mock.calls[0]).toEqual(send.mock.calls[1]);
    expect(op.participantIds).toEqual([id(2)]);
    expect(Object.isFrozen(op.participantIds)).toBe(true);
    await expect(op.dispatch({ ...scope, epoch: 2 }, send, 102)).rejects.toThrow();
    expect(op.eligible(100 + 86400_000)).toBe(false);
    expect(op.eligible(103)).toBe(false);
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("fails closed on backwards clocks and coalesces in-flight dispatch", async () => {
    const op = new GroupOperation(scope, "Group", [], 100);
    let release!: () => void;
    const send = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const pending = op.dispatch(scope, send, 101);
    await expect(op.dispatch(scope, send, 101)).rejects.toThrow();
    release();
    await pending;
    expect(op.eligible(100)).toBe(false);
    expect(op.eligible(102)).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
