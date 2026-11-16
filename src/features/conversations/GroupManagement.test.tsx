import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "../../shared/i18n";
import { ApiError } from "../../shared/api/error";
import { ConversationDetailPage } from "./ConversationPages";

const f = vi.hoisted(() => ({
  context: {
    profileId: "profile",
    accountId: "account",
    userId: "019a0000-0000-7000-8000-000000000001",
    epoch: 1,
    signal: new AbortController().signal,
  },
  owner: {
    activeContext: vi.fn(),
    isCurrent: vi.fn(),
    getConversation: vi.fn(),
    listGroupMembers: vi.fn(),
    findUser: vi.fn(),
    renameGroup: vi.fn(),
    addGroupMember: vi.fn(),
    changeGroupMemberRole: vi.fn(),
    removeGroupMember: vi.fn(),
    transferGroupOwner: vi.fn(),
    leaveGroup: vi.fn(),
    probeGroupMembers: vi.fn(),
  },
}));
vi.mock("../authentication/SessionOwner", () => ({
  useSession: () => ({ owner: f.owner, status: { kind: "ready" } }),
}));
vi.mock("../../shared/storage/platform-storage", () => ({
  profileRepository: async () => ({
    load: async () => ({
      serverProfiles: [{ id: "profile", label: "Local", canonicalUrl: "https://example.test/" }],
      accounts: [{ id: "account", username: "alice" }],
    }),
  }),
}));
const id = "019a0000-0000-7000-8000-000000000011";
const peer = { id: "019a0000-0000-7000-8000-000000000002", username: "bob" };
const date = "2026-11-06T12:00:00Z";
const group = {
  id,
  title: "Initial group",
  kind: "group",
  created_at: date,
  updated_at: date,
  membership: { role: "owner" },
  unread_count: 0,
};
function mount() {
  return render(
    <I18nextProvider i18n={createI18n("en")}>
      <MemoryRouter initialEntries={[`/conversations/${id}`]}>
        <Routes>
          <Route path="/conversations/:conversationId" element={<ConversationDetailPage />} />
          <Route path="/conversations" element={<p>Returned to inbox</p>} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}
async function ready() {
  await waitFor(() => expect(screen.getByRole("button", { name: "Save title" })).toBeEnabled());
}
async function confirm() {
  const dialog = await screen.findByRole("dialog", { name: "Confirm action" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Confirm action" }));
}
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    },
  });
  vi.resetAllMocks();
  f.owner.activeContext.mockReturnValue(f.context);
  f.owner.isCurrent.mockResolvedValue(true);
  f.owner.getConversation.mockResolvedValue(group);
  f.owner.listGroupMembers.mockResolvedValue({
    items: [
      { user: { id: f.context.userId, username: "alice" }, role: "owner", joined_at: date },
      { user: peer, role: "member", joined_at: date },
    ],
    has_more: false,
  });
  f.owner.findUser.mockResolvedValue(peer);
  f.owner.renameGroup.mockResolvedValue(group);
  f.owner.addGroupMember.mockResolvedValue({ user: peer, role: "admin", joined_at: date });
});
describe("Group management review", () => {
  it("preflights Owner-only deletion and requires explicit irreversible confirmation", async () => {
    f.owner.probeGroupMembers.mockResolvedValue({
      items: [
        { user: { id: f.context.userId, username: "alice" }, role: "owner", joined_at: date },
      ],
      has_more: false,
    });
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Review leaving group" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(/all memberships, all messages and reply-linked history/),
    ).toBeInTheDocument();
    expect(f.owner.probeGroupMembers).toHaveBeenCalledTimes(1);
    expect(f.owner.leaveGroup).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete group by leaving" }));
    await screen.findByText("Returned to inbox");
    expect(f.owner.leaveGroup).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("region", { name: "Members" })).not.toBeInTheDocument();
  });
  it("does not infer sole ownership from one loaded row or a partial probe", async () => {
    f.owner.probeGroupMembers.mockResolvedValue({
      items: [
        { user: { id: f.context.userId, username: "alice" }, role: "owner", joined_at: date },
      ],
      has_more: true,
      next_cursor: "next",
    });
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Review leaving group" }));
    await screen.findByText(
      "Sole ownership could not be verified. No destructive action is available.",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(f.owner.leaveGroup).not.toHaveBeenCalled();
  });
  it("Owner with others must transfer instead of receiving deletion confirmation", async () => {
    f.owner.probeGroupMembers.mockResolvedValue({
      items: [
        { user: { id: f.context.userId, username: "alice" }, role: "owner", joined_at: date },
        { user: peer, role: "member", joined_at: date },
      ],
      has_more: false,
    });
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Review leaving group" }));
    await screen.findByText(
      "Other members remain. Transfer ownership to an existing member before leaving.",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(f.owner.leaveGroup).not.toHaveBeenCalled();
  });
  it("non-Owner leaves with ordinary wording and no sole-Owner probe", async () => {
    f.owner.getConversation.mockResolvedValue({ ...group, membership: { role: "member" } });
    mount();
    const leave = await screen.findByRole("button", { name: "Review leaving group" });
    await waitFor(() => expect(leave).toBeEnabled());
    fireEvent.click(leave);
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(/This does not delete the Group for other members/),
    ).toBeInTheDocument();
    await confirm();
    await screen.findByText("Returned to inbox");
    expect(f.owner.probeGroupMembers).not.toHaveBeenCalled();
  });
  it("handles a member added after sole-Owner preflight without claiming deletion", async () => {
    f.owner.probeGroupMembers.mockResolvedValue({
      items: [
        { user: { id: f.context.userId, username: "alice" }, role: "owner", joined_at: date },
      ],
      has_more: false,
    });
    f.owner.leaveGroup.mockRejectedValue(
      new ApiError("http", { status: 409, code: "conversation.ownership_transfer_required" }),
    );
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Review leaving group" }));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Delete group by leaving",
      }),
    );
    await screen.findByText("Transfer ownership before leaving a Group with other members.");
    expect(screen.queryByText("Returned to inbox")).not.toBeInTheDocument();
    expect(f.owner.leaveGroup).toHaveBeenCalledTimes(1);
  });
  it("transfers only to a loaded member and drops Owner controls after fresh own-role read", async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Transfer ownership to bob" }));
    await screen.findByText(/The selected existing member becomes Owner/);
    f.owner.getConversation.mockResolvedValue({ ...group, membership: { role: "admin" } });
    f.owner.listGroupMembers.mockResolvedValue({
      items: [{ user: peer, role: "owner", joined_at: date }],
      has_more: false,
    });
    await confirm();
    await screen.findByText("Current server state matches the requested change.");
    expect(f.owner.transferGroupOwner).toHaveBeenCalledWith(
      f.context,
      id,
      peer.id,
      expect.any(AbortSignal),
    );
    expect(screen.queryByRole("button", { name: /Transfer ownership/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save title" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Continue with current state" }));
    await ready();
  });
  it("labels self-transfer as no change and never promises that ownership moved", async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Transfer ownership to alice" }));
    await screen.findByText(
      "You remain Owner. Transferring ownership to yourself makes no change.",
    );
    await confirm();
    await screen.findByText("Current server state matches the requested change.");
    expect(f.owner.transferGroupOwner).toHaveBeenCalledWith(
      f.context,
      id,
      f.context.userId,
      expect.any(AbortSignal),
    );
  });
  it("offers non-Owner row actions but never removes self or modifies Owner", async () => {
    mount();
    await ready();
    expect(screen.getByRole("button", { name: "Promote bob to Admin" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Demote alice|Remove alice/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove bob from group" }));
    expect(f.owner.removeGroupMember).not.toHaveBeenCalled();
    await confirm();
    await screen.findByText(/The server confirmed this request/);
    expect(f.owner.removeGroupMember).toHaveBeenCalledWith(
      f.context,
      id,
      peer.id,
      expect.any(AbortSignal),
    );
  });
  it("allows Admin self-demotion and hides all manager actions after authoritative refresh", async () => {
    f.owner.getConversation.mockResolvedValue({ ...group, membership: { role: "admin" } });
    f.owner.listGroupMembers.mockResolvedValue({
      items: [
        { user: { id: f.context.userId, username: "alice" }, role: "admin", joined_at: date },
        { user: peer, role: "owner", joined_at: date },
      ],
      has_more: false,
    });
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Demote alice to Member" }));
    expect(
      within(await screen.findByRole("dialog")).getByText(
        "You will lose Group management permissions.",
      ),
    ).toBeInTheDocument();
    f.owner.getConversation.mockResolvedValue({ ...group, membership: { role: "member" } });
    await confirm();
    await screen.findByText(/The server confirmed this request/);
    expect(f.owner.changeGroupMemberRole).toHaveBeenCalledWith(
      f.context,
      id,
      f.context.userId,
      "member",
      expect.any(AbortSignal),
    );
    expect(screen.queryByRole("button", { name: "Save title" })).not.toBeInTheDocument();
  });
  it("handles protected Owner rejection without declaring the Group inaccessible", async () => {
    f.owner.removeGroupMember.mockRejectedValue(
      new ApiError("http", { status: 409, code: "conversation.owner_protected" }),
    );
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Remove bob from group" }));
    await confirm();
    await screen.findByText(/The Owner cannot be changed or removed/);
    expect(screen.getByRole("heading", { name: "Initial group" })).toBeInTheDocument();
  });
  it("reviews exact rename input and updates from a new summary, not the write DTO", async () => {
    mount();
    await ready();
    fireEvent.change(screen.getByLabelText("Group title"), { target: { value: " exact 😀 " } });
    fireEvent.click(screen.getByRole("button", { name: "Save title" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("alice — Local — https://example.test/")).toBeInTheDocument();
    expect(f.owner.renameGroup).not.toHaveBeenCalled();
    f.owner.getConversation.mockResolvedValue({ ...group, title: "Changed concurrently" });
    await confirm();
    await screen.findByText(
      "Current server state differs from the requested change. This does not prove the earlier request never took effect.",
    );
    expect(screen.getByRole("heading", { name: "Changed concurrently" })).toBeInTheDocument();
    expect(f.owner.renameGroup).toHaveBeenCalledWith(
      f.context,
      id,
      " exact 😀 ",
      expect.any(AbortSignal),
    );
  });
  it("confirms resolved canonical identity before bodyless add", async () => {
    mount();
    await ready();
    fireEvent.change(screen.getByLabelText("Full username"), { target: { value: "BOB" } });
    fireEvent.click(screen.getByRole("button", { name: "Find user" }));
    fireEvent.click(await screen.findByRole("button", { name: "Review member addition" }));
    expect(within(await screen.findByRole("dialog")).getByText("bob")).toBeInTheDocument();
    expect(f.owner.addGroupMember).not.toHaveBeenCalled();
    await confirm();
    await screen.findByText("Current server state matches the requested change.");
    expect(f.owner.addGroupMember).toHaveBeenCalledTimes(1);
  });
  it("does not offer Group management for Direct", async () => {
    f.owner.getConversation.mockResolvedValue({
      ...group,
      kind: "direct",
      membership: { role: "direct" },
    });
    mount();
    await screen.findByRole("heading", { name: "Initial group" });
    expect(screen.queryByRole("region", { name: "Manage group" })).not.toBeInTheDocument();
    expect(f.owner.listGroupMembers).not.toHaveBeenCalled();
  });
  it("keeps Members readable but hides manager controls for ordinary Members", async () => {
    f.owner.getConversation.mockResolvedValue({ ...group, membership: { role: "member" } });
    mount();
    await screen.findByRole("region", { name: "Members" });
    expect(screen.queryByRole("button", { name: "Save title" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Find user" })).not.toBeInTheDocument();
  });
  it("never resends an uncertain rename and preserves its recovery across summary refresh", async () => {
    f.owner.renameGroup.mockRejectedValue(new ApiError("transport"));
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Save title" }));
    await confirm();
    await screen.findByText(/This change may already have happened/);
    fireEvent.click(screen.getByRole("button", { name: "Check current state" }));
    await screen.findByText("Current server state matches the requested change.");
    expect(screen.getByText(/This change may already have happened/)).toBeInTheDocument();
    expect(f.owner.renameGroup).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Save title" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Acknowledge uncertainty and continue" }));
    await ready();
  });
  it("rejects blank or overlong title without opening confirmation", async () => {
    mount();
    await ready();
    fireEvent.change(screen.getByLabelText("Group title"), { target: { value: "😀".repeat(65) } });
    fireEvent.click(screen.getByRole("button", { name: "Save title" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(f.owner.renameGroup).not.toHaveBeenCalled();
  });
  it("cancel returns focus without sending", async () => {
    mount();
    await ready();
    const save = screen.getByRole("button", { name: "Save title" });
    save.focus();
    fireEvent.click(save);
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" }),
    );
    await waitFor(() => expect(save).toHaveFocus());
    expect(f.owner.renameGroup).not.toHaveBeenCalled();
    await act(async () => {});
  });
});
