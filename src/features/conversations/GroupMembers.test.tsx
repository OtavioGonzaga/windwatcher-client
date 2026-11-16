import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "../../shared/i18n";
import { ApiError } from "../../shared/api/error";
import type { AuthenticationService } from "../authentication/service";
import { GroupMembers } from "./GroupMembers";
import type { Member } from "./group-validation";

const member = (n: number, role: Member["role"] = "member"): Member => ({
  user: {
    id: `019a0000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`,
    username: `user_${n}`,
  },
  role,
  joined_at: "2026-11-06T12:00:00Z",
});
const context = {
  accountId: "account",
  profileId: "profile",
  userId: member(1).user.id,
  epoch: 1,
  signal: new AbortController().signal,
};
const list = vi.fn();
const current = vi.fn();
const unavailable = vi.fn();
// Only the two narrow presentation-facing operations are needed by this component.
const owner: Pick<AuthenticationService, "listGroupMembers" | "isCurrent"> = {
  listGroupMembers: list,
  isCurrent: current,
};
function mount() {
  return render(
    <I18nextProvider i18n={createI18n("en")}>
      <GroupMembers
        owner={owner}
        context={context}
        conversationId={member(9).user.id}
        onUnavailable={unavailable}
      />
    </I18nextProvider>,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  current.mockResolvedValue(true);
  list.mockResolvedValue({ items: [member(1, "owner")], has_more: false });
});
describe("authoritative Group member panel", () => {
  it("shows attributed roles and dates without management or private state", async () => {
    list.mockResolvedValue({
      items: [member(1, "owner"), member(2, "admin"), member(3)],
      has_more: false,
    });
    mount();
    await screen.findByText("user_1");
    expect(screen.getByText("Owner — sole Group owner")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByText("Member")).toBeInTheDocument();
    expect(screen.getAllByText(/Joined:/)).toHaveLength(3);
    expect(
      screen.queryByRole("button", { name: /Remove|Rename|Transfer/ }),
    ).not.toBeInTheDocument();
  });
  it("loads more than 100 rows, preserves order and first occurrence across overlap", async () => {
    list
      .mockResolvedValueOnce({
        items: Array.from({ length: 50 }, (_, n) => member(n + 1)),
        has_more: true,
        next_cursor: "a",
      })
      .mockResolvedValueOnce({
        items: Array.from({ length: 50 }, (_, n) => member(n + 50)),
        has_more: true,
        next_cursor: "b",
      })
      .mockResolvedValueOnce({ items: [member(100), member(101)], has_more: false });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Load more members" }));
    await screen.findByText("user_99");
    fireEvent.click(screen.getByRole("button", { name: "Load more members" }));
    await screen.findByText("user_101");
    expect(screen.getAllByRole("listitem")).toHaveLength(101);
    expect(within(screen.getAllByRole("listitem")[49]!).getByText("user_50")).toBeInTheDocument();
    expect(list.mock.calls.map((call) => call[2])).toEqual([undefined, "a", "b"]);
    expect(screen.queryByRole("button", { name: "Load more members" })).not.toBeInTheDocument();
  });
  it.each(["invalid", "repeated"])("restarts instead of looping on %s cursor", async (kind) => {
    list.mockResolvedValueOnce({ items: [member(1)], has_more: true, next_cursor: "a" });
    if (kind === "invalid")
      list.mockRejectedValueOnce(
        new ApiError("http", { status: 400, code: "pagination.invalid_cursor" }),
      );
    else list.mockResolvedValueOnce({ items: [member(2)], has_more: true, next_cursor: "a" });
    list.mockResolvedValueOnce({ items: [member(3)], has_more: false });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Load more members" }));
    fireEvent.click(await screen.findByRole("button", { name: "Restart member list" }));
    await screen.findByText("user_3");
    expect(screen.queryByText("user_1")).not.toBeInTheDocument();
    expect(list.mock.calls[2]?.[2]).toBeUndefined();
  });
  it("refresh aborts and fences a late continuation even when transport ignores cancellation", async () => {
    let finish!: (value: unknown) => void;
    list
      .mockResolvedValueOnce({ items: [member(1)], has_more: true, next_cursor: "a" })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValueOnce({ items: [member(3)], has_more: false });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Load more members" }));
    fireEvent.click(screen.getByRole("button", { name: "Refresh members" }));
    await screen.findByText("user_3");
    await act(async () => finish({ items: [member(2)], has_more: false }));
    expect(screen.queryByText("user_1")).not.toBeInTheDocument();
    expect(screen.queryByText("user_2")).not.toBeInTheDocument();
  });
  it.each([403, 404])(
    "clears roster and invalidates parent summary after HTTP %s",
    async (status) => {
      list
        .mockResolvedValueOnce({ items: [member(1)], has_more: true, next_cursor: "a" })
        .mockRejectedValueOnce(new ApiError("http", { status, code: "conversation.not_found" }));
      mount();
      fireEvent.click(await screen.findByRole("button", { name: "Load more members" }));
      await waitFor(() => expect(unavailable).toHaveBeenCalledTimes(1));
      expect(screen.queryByText("user_1")).not.toBeInTheDocument();
    },
  );
  it("preserves partial rows for network failure then honors a 429 cooldown", async () => {
    list
      .mockResolvedValueOnce({ items: [member(1)], has_more: true, next_cursor: "a" })
      .mockRejectedValueOnce(new ApiError("transport"))
      .mockRejectedValueOnce(
        new ApiError("http", { status: 429, code: "rate_limit.exceeded", retryAfterMs: 100 }),
      )
      .mockResolvedValueOnce({ items: [member(2)], has_more: false });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Load more members" }));
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await screen.findByText(/Too many requests/);
    expect(screen.getByText("user_1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh members" })).toBeDisabled();
    await waitFor(() => expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("user_2");
    expect(list.mock.calls.map((call) => call[2])).toEqual([undefined, "a", "a", "a"]);
  });
  it("treats an empty first Group page as inconsistent, not a fabricated empty roster", async () => {
    list.mockResolvedValue({ items: [], has_more: false });
    mount();
    await screen.findByRole("button", { name: "Restart member list" });
  });
  it("does not publish a result after the active context changed", async () => {
    current.mockResolvedValue(false);
    mount();
    await act(async () => {});
    expect(screen.queryByText("user_1")).not.toBeInTheDocument();
  });
});
