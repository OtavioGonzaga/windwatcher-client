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
