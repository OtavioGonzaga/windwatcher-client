import { act, fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "../../shared/i18n";
import { ApiError } from "../../shared/api/error";
import { NewDirectPage } from "./NewDirectPage";

const f = vi.hoisted(() => ({
  active: {
    profileId: "profile",
    accountId: "account",
    userId: "self",
    epoch: 1,
    signal: new AbortController().signal,
  },
  owner: { activeContext: vi.fn(), isCurrent: vi.fn(), findUser: vi.fn(), openDirect: vi.fn() },
}));
vi.mock("../authentication/SessionOwner", () => ({
  useSession: () => ({ owner: f.owner, status: { kind: "ready" } }),
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
const peer = { id: "peer", username: "alice" };
function mount() {
  return render(
    <I18nextProvider i18n={createI18n("en")}>
      <MemoryRouter initialEntries={["/conversations/new"]}>
        <Routes>
          <Route path="/conversations/new" element={<NewDirectPage />} />
          <Route path="/conversations/:id" element={<p>Authoritative detail</p>} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}
async function find() {
  const button = await screen.findByRole("button", { name: "Find user" });
  await act(async () => {});
  fireEvent.change(screen.getByLabelText("Full username"), { target: { value: "ALICE" } });
  fireEvent.click(button);
  await screen.findByText(/Start a conversation with alice/);
}
describe("confirmed Direct flow", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    f.owner.activeContext.mockReturnValue(f.active);
    f.owner.isCurrent.mockResolvedValue(true);
    f.owner.findUser.mockResolvedValue(peer);
  });
  it("requires explicit confirmation and invalidates it on editing", async () => {
    mount();
    await find();
    expect(screen.getByText("Local — https://example.test/proxy/")).toBeInTheDocument();
    expect(f.owner.openDirect).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Full username"), { target: { value: "bob" } });
    expect(screen.queryByRole("button", { name: "Start conversation" })).not.toBeInTheDocument();
    expect(f.owner.openDirect).not.toHaveBeenCalled();
  });
  it("preserves key and payload on explicit ambiguous retry without automatic replay", async () => {
    f.owner.openDirect
      .mockRejectedValueOnce(new ApiError("transport"))
      .mockResolvedValueOnce({ id: "direct" });
    mount();
    await find();
    fireEvent.click(screen.getByRole("button", { name: "Start conversation" }));
    await screen.findByText(/The conversation may already exist/);
    expect(f.owner.openDirect).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("Authoritative detail");
    expect(f.owner.openDirect).toHaveBeenCalledTimes(2);
    expect(f.owner.openDirect.mock.calls[0]?.slice(0, 3)).toEqual(
      f.owner.openDirect.mock.calls[1]?.slice(0, 3),
    );
  });
  it.each([
    ["idempotency.key_reused", "This attempt conflicts"],
    ["idempotency.result_unavailable", "The previous conversation result"],
  ])("stops the operation for %s", async (code, message) => {
    f.owner.openDirect.mockRejectedValueOnce(new ApiError("http", { status: 409, code }));
    mount();
    await find();
    fireEvent.click(screen.getByRole("button", { name: "Start conversation" }));
    await screen.findByText(new RegExp(message));
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(f.owner.openDirect).toHaveBeenCalledTimes(1);
  });
  it("never navigates after the form unmounts with a dispatched POST", async () => {
    let resolve!: (value: unknown) => void;
    f.owner.openDirect.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const view = mount();
    await find();
    fireEvent.click(screen.getByRole("button", { name: "Start conversation" }));
    view.unmount();
    await act(async () => resolve({ id: "old" }));
    expect(screen.queryByText("Authoritative detail")).not.toBeInTheDocument();
  });
  it("requires a new lookup and confirmation after the 24-hour retry window", async () => {
    f.owner.openDirect.mockRejectedValue(new ApiError("transport"));
    mount();
    await find();
    fireEvent.click(screen.getByRole("button", { name: "Start conversation" }));
    await screen.findByText(/The conversation may already exist/);
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 86400_001);
    try {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      await screen.findByText(/retry window has ended/);
      expect(f.owner.openDirect).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole("button", { name: "Search again" }));
      fireEvent.click(screen.getByRole("button", { name: "Find user" }));
      await screen.findByText(/Start a conversation with alice/);
      fireEvent.click(screen.getByRole("button", { name: "Start conversation" }));
      await screen.findByText(/The conversation may already exist/);
      expect(f.owner.openDirect.mock.calls[1]?.[2]).not.toBe(f.owner.openDirect.mock.calls[0]?.[2]);
    } finally {
      clock.mockRestore();
    }
  });
  it("does not send requests without a ready context", () => {
    f.owner.activeContext.mockReturnValue(null);
    mount();
    expect(screen.getByText("Select a signed-in account to see its inbox.")).toBeInTheDocument();
    expect(f.owner.findUser).not.toHaveBeenCalled();
    expect(f.owner.openDirect).not.toHaveBeenCalled();
  });
  it("drops an obsolete lookup even if its transport ignores abort", async () => {
    let resolve!: (value: unknown) => void;
    f.owner.findUser.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    mount();
    await act(async () => {});
    fireEvent.change(screen.getByLabelText("Full username"), { target: { value: "alice" } });
    fireEvent.click(screen.getByRole("button", { name: "Find user" }));
    fireEvent.change(screen.getByLabelText("Full username"), { target: { value: "bob" } });
    await act(async () => resolve(peer));
    expect(screen.queryByRole("button", { name: "Start conversation" })).not.toBeInTheDocument();
  });
  it("coalesces repeated confirmation clicks while a POST is pending", async () => {
    let resolve!: (value: unknown) => void;
    f.owner.openDirect.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    mount();
    await find();
    const start = screen.getByRole("button", { name: "Start conversation" });
    act(() => {
      start.click();
      start.click();
      start.click();
    });
    expect(f.owner.openDirect).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ id: "direct" }));
    expect(await screen.findByText("Authoritative detail")).toBeInTheDocument();
  });
});
