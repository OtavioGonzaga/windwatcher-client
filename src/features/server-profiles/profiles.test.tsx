import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { Providers } from "../../app/Providers";
import { createI18n } from "../../shared/i18n";
import { emptyState } from "./schema";
import { SaveServerProfile } from "./SaveServerProfile";
import { ServerProfilesList } from "./ServerProfilesList";
import type { DiscoveryResult } from "../server-discovery/discover-server";
const mock = vi.hoisted(() => ({
  load: vi.fn(),
  saveInspection: vi.fn(),
  renameProfile: vi.fn(),
  forgetProfile: vi.fn(),
  subscribe: vi.fn(),
}));
vi.mock("../../shared/storage/platform-storage", () => ({ profileRepository: async () => mock }));
const result: DiscoveryResult = {
  kind: "supported",
  root: "https://example.test/",
  metadata: {
    service: "windwatcher",
    api_versions: ["v1"],
    auth_methods: ["password"],
    registration: "closed",
  },
};
const profile = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  canonicalUrl: result.root,
  label: "My server",
  discovery: { kind: "supported" as const, inspectedAt: "2026-11-06T00:00:00.000Z" },
  createdAt: "2026-11-06T00:00:00.000Z",
  updatedAt: "2026-11-06T00:00:00.000Z",
};
function mount(child: React.ReactNode) {
  return render(
    <Providers i18n={createI18n("en")}>
      <MemoryRouter>{child}</MemoryRouter>
    </Providers>,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  mock.load.mockResolvedValue(emptyState());
  mock.subscribe.mockReturnValue(() => {});
});
it("only persists after explicit save and announces confirmed durability", async () => {
  mock.saveInspection.mockResolvedValue({
    ...emptyState(),
    revision: 1,
    serverProfiles: [profile],
  });
  mount(<SaveServerProfile result={result} acknowledged={false} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Save server" })).toBeEnabled());
  expect(mock.saveInspection).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Local display label"), {
    target: { value: "My server" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save server" }));
  await screen.findByText(/Server saved locally/);
  expect(mock.saveInspection).toHaveBeenCalledWith(result, "My server", false, false, 0);
});
it("shows existing label and only offers a deliberate existing-profile update", async () => {
  mock.load.mockResolvedValue({ ...emptyState(), serverProfiles: [profile] });
  mount(<SaveServerProfile result={result} acknowledged={false} />);
  await screen.findByText(/already saved as My server/);
  expect(screen.queryByRole("button", { name: "Save server" })).not.toBeInTheDocument();
  expect(screen.getByLabelText("Local display label")).toHaveValue("My server");
  fireEvent.click(screen.getByRole("button", { name: "Update existing server" }));
  await waitFor(() =>
    expect(mock.saveInspection).toHaveBeenCalledWith(result, "My server", false, true, 0),
  );
});
it("does not report success on failed persistence or expose underlying errors", async () => {
  mock.saveInspection.mockRejectedValue(new Error("private backend contents"));
  mount(<SaveServerProfile result={result} acknowledged={false} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Save server" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Save server" }));
  await screen.findByRole("alert");
  expect(screen.queryByText(/Server saved locally/)).not.toBeInTheDocument();
  expect(screen.queryByText(/private backend contents/)).not.toBeInTheDocument();
});
it("lists historical profiles without network effects; forget requires confirmation and restores focus", async () => {
  mock.load.mockResolvedValue({ ...emptyState(), serverProfiles: [profile] });
  mock.forgetProfile.mockResolvedValue(emptyState());
  mount(<ServerProfilesList />);
  await screen.findByRole("heading", { name: "My server" });
  expect(screen.getByText(/Last advertisement/)).toBeVisible();
  expect(screen.getByRole("link", { name: "Inspect again" })).toHaveAttribute(
    "href",
    "/connect?server=https%3A%2F%2Fexample.test%2F",
  );
  fireEvent.click(screen.getByRole("button", { name: "Forget server" }));
  expect(mock.forgetProfile).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Confirm forget" })).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByRole("button", { name: "Forget server" })).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "Forget server" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm forget" }));
  await screen.findByText(/No servers saved yet/);
  expect(screen.getByRole("heading", { name: "Saved servers" })).toHaveFocus();
});
it("external storage changes disable stale saves until explicit reload", async () => {
  mount(<SaveServerProfile result={result} acknowledged={false} />);
  await waitFor(() => expect(mock.subscribe).toHaveBeenCalled());
  await act(async () => {
    mock.subscribe.mock.calls[0]![0]();
  });
  expect(screen.getByRole("button", { name: "Save server" })).toBeDisabled();
  expect(screen.getByRole("alert")).toHaveTextContent(/changed elsewhere/);
});
