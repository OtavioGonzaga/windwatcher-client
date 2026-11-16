import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "../../shared/i18n";
import { GroupCreationPage } from "./GroupCreationPage";
import type { GroupOperation } from "./group-operation";

const f = vi.hoisted(() => ({
  active: {
    profileId: "profile",
    accountId: "account",
    userId: "019a0000-0000-7000-8000-000000000001",
    epoch: 1,
    signal: new AbortController().signal,
  },
  owner: { activeContext: vi.fn(), isCurrent: vi.fn(), findUser: vi.fn(), createGroup: vi.fn() },
  send: vi.fn(),
}));
vi.mock("../authentication/SessionOwner", () => ({
  useSession: () => ({ owner: f.owner, status: { kind: "ready", username: "alice" } }),
}));
vi.mock("../../shared/storage/platform-storage", () => ({
  profileRepository: async () => ({
    load: async () => ({
      serverProfiles: [
        { id: "profile", label: "Local", canonicalUrl: "https://example.test/proxy/" },
      ],
    }),
  }),
}));
const peer = { id: "019a0000-0000-7000-8000-000000000002", username: "bob" };
function mount() {
  return render(
    <I18nextProvider i18n={createI18n("en")}>
      <MemoryRouter initialEntries={["/conversations/groups/new"]}>
        <Routes>
          <Route path="/conversations/groups/new" element={<GroupCreationPage />} />
          <Route path="/conversations/:id" element={<p>Authoritative Group detail</p>} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}
async function review(title = " exact 😀 ") {
  await waitFor(() => expect(screen.getByRole("button", { name: "Review group" })).toBeEnabled());
  fireEvent.change(screen.getByLabelText("Group title"), { target: { value: title } });
  fireEvent.click(screen.getByRole("button", { name: "Review group" }));
  await screen.findByRole("button", { name: "Create group" });
}
async function add(username = "BOB") {
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Find and add participant" })).toBeEnabled(),
  );
  fireEvent.change(screen.getByLabelText("Full username"), { target: { value: username } });
  fireEvent.click(screen.getByRole("button", { name: "Find and add participant" }));
}
describe("Group creation and review", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    f.owner.activeContext.mockReturnValue(f.active);
    f.owner.isCurrent.mockResolvedValue(true);
    f.owner.findUser.mockResolvedValue(peer);
    f.send.mockResolvedValue({ id: "server-id" });
    f.owner.createGroup.mockImplementation((_active, operation: GroupOperation) =>
      operation.dispatch(f.active, f.send),
    );
  });
  it("reviews exact owner-only input, then navigates only after explicit creation", async () => {
    mount();
    await review();
    expect(screen.getByText("Local — https://example.test/proxy/")).toBeInTheDocument();
    expect(screen.getByText("Owner: alice")).toBeInTheDocument();
    expect(screen.getByText("Only you will join this Group as Owner.")).toBeInTheDocument();
    expect(f.send).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Create group" }));
    expect(await screen.findByText("Authoritative Group detail")).toBeInTheDocument();
    expect(f.send.mock.calls[0]?.[0]).toEqual({
      kind: "group",
      title: " exact 😀 ",
      participant_ids: [],
    });
  });
  it("deduplicates canonical peers, excludes owner and permits removal", async () => {
    mount();
    await add();
    await screen.findByText("Participant added as Member.");
    await add("bob");
    await screen.findByText("Already added.");
    expect(screen.getAllByRole("button", { name: "Remove bob" })).toHaveLength(1);
    f.owner.findUser.mockResolvedValueOnce({ id: f.active.userId, username: "alice" });
    await add("alice");
    await screen.findByText("Already included as Owner.");
    fireEvent.click(screen.getByRole("button", { name: "Remove bob" }));
    expect(screen.queryByText("bob", { exact: true })).not.toBeInTheDocument();
  });
  it.each(["", "   ", "😀".repeat(65)])("rejects invalid title without POST", async (title) => {
    mount();
    await waitFor(() => expect(screen.getByRole("button", { name: "Review group" })).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Group title"), { target: { value: title } });
    fireEvent.click(screen.getByRole("button", { name: "Review group" }));
    expect(screen.getByLabelText("Group title")).toHaveAttribute("aria-invalid", "true");
    expect(f.owner.createGroup).not.toHaveBeenCalled();
  });
  it("ignores a lookup whose input was edited while transport ignored abort", async () => {
    let resolve!: (value: unknown) => void;
    f.owner.findUser.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    mount();
    await add();
    fireEvent.change(screen.getByLabelText("Full username"), { target: { value: "alice" } });
    await act(async () => resolve(peer));
    expect(screen.queryByRole("button", { name: "Remove bob" })).not.toBeInTheDocument();
  });
  it("has no requests without a ready selected context", () => {
    f.owner.activeContext.mockReturnValue(null);
    mount();
    expect(screen.getByText("Select a signed-in account to see its inbox.")).toBeInTheDocument();
    expect(f.owner.findUser).not.toHaveBeenCalled();
    expect(f.owner.createGroup).not.toHaveBeenCalled();
  });
  it("coalesces confirmation spam and discards completion after unmount", async () => {
    let resolve!: (value: unknown) => void;
    f.send.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const view = mount();
    await review();
    const button = screen.getByRole("button", { name: "Create group" });
    act(() => {
      button.click();
      button.click();
      button.click();
    });
    expect(f.owner.createGroup).toHaveBeenCalledTimes(1);
    view.unmount();
    await act(async () => resolve({ id: "late" }));
    expect(screen.queryByText("Authoritative Group detail")).not.toBeInTheDocument();
  });
});
