import { act, fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "../../shared/i18n";
import { ApiError } from "../../shared/api/error";
import type { ConversationPage } from "./validation";
import { ConversationDetailPage, InboxPage } from "./ConversationPages";

const mocked = vi.hoisted(() => ({
  context: {
    profileId: "server-a",
    accountId: "account-a",
    userId: "user-a",
    epoch: 1,
    signal: new AbortController().signal,
  },
  owner: {
    activeContext: vi.fn(),
    listConversations: vi.fn(),
    getConversation: vi.fn(),
    isCurrent: vi.fn(),
  },
}));
vi.mock("../authentication/SessionOwner", () => ({
  useSession: () => ({ owner: mocked.owner, status: { kind: "ready" } }),
}));
const row = (id: string, title: string) => ({
  id,
  title,
  kind: "direct" as const,
  created_at: "2026-11-06T12:00:00Z",
  updated_at: "2026-11-06T12:00:00Z",
  membership: { role: "direct" as const },
  unread_count: 0,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function view() {
  return (
    <I18nextProvider i18n={createI18n("en")}>
      <MemoryRouter>
        <InboxPage />
      </MemoryRouter>
    </I18nextProvider>
  );
}

describe("scoped inbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.owner.activeContext.mockReturnValue(mocked.context);
    mocked.owner.isCurrent.mockResolvedValue(true);
  });
  it("discards a late page after a refresh, even when a transport ignores abort", async () => {
    const oldPage = deferred<ConversationPage>();
    mocked.owner.listConversations
      .mockResolvedValueOnce({
        items: [row("1", "Old first")],
        has_more: true,
        next_cursor: "next",
      })
      .mockReturnValueOnce(oldPage.promise)
      .mockResolvedValueOnce({ items: [row("3", "New first")], has_more: false });
    render(view());
    await screen.findByText("Old first");
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByText("New first");
    await act(async () => oldPage.resolve({ items: [row("2", "Late old page")], has_more: false }));
    expect(screen.queryByText("Late old page")).not.toBeInTheDocument();
    expect(screen.queryByText("Old first")).not.toBeInTheDocument();
  });
  it("retains first occurrence and server order across overlapping pages", async () => {
    mocked.owner.listConversations
      .mockResolvedValueOnce({
        items: [row("2", "First"), row("1", "Second")],
        has_more: true,
        next_cursor: "next",
      })
      .mockResolvedValueOnce({
        items: [row("1", "Changed duplicate"), row("3", "Third")],
        has_more: false,
      });
    render(view());
    await screen.findByText("First");
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("Third");
    expect(
      screen.getAllByRole("listitem").map((item) => item.querySelector("a")?.textContent),
    ).toEqual(["First", "Second", "Third"]);
    expect(screen.queryByText("Changed duplicate")).not.toBeInTheDocument();
  });
  it("never publishes a previous account response after the scope changes", async () => {
    const old = deferred<ConversationPage>();
    mocked.owner.listConversations.mockReturnValueOnce(old.promise).mockResolvedValueOnce({
      items: [row("2", "Account B")],
      has_more: false,
    });
    const rendered = render(view());
    mocked.owner.activeContext.mockReturnValue({
      ...mocked.context,
      profileId: "server-b",
      accountId: "account-b",
      epoch: 2,
    });
    rendered.rerender(view());
    await screen.findByText("Account B");
    await act(async () => old.resolve({ items: [row("1", "Secret A")], has_more: false }));
    expect(screen.queryByText("Secret A")).not.toBeInTheDocument();
    expect(screen.getByText("Account B")).toBeInTheDocument();
  });
  it("restarts from the first page after an invalid continuation cursor", async () => {
    mocked.owner.listConversations
      .mockResolvedValueOnce({ items: [row("1", "First")], has_more: true, next_cursor: "expired" })
      .mockRejectedValueOnce(
        new ApiError("http", { status: 400, code: "pagination.invalid_cursor" }),
      )
      .mockResolvedValueOnce({ items: [row("2", "Restarted")], has_more: false });
    render(view());
    await screen.findByText("First");
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText(/This page has expired/);
    fireEvent.click(screen.getByRole("button", { name: "Restart inbox" }));
    await screen.findByText("Restarted");
    expect(mocked.owner.listConversations.mock.calls[2]?.[1]).toBeUndefined();
    expect(screen.queryByText("First")).not.toBeInTheDocument();
  });
  it("renders a safe unavailable state for an inaccessible detail", async () => {
    mocked.owner.getConversation.mockRejectedValueOnce(
      new ApiError("http", { status: 404, code: "conversation.not_found" }),
    );
    render(
      <I18nextProvider i18n={createI18n("en")}>
        <MemoryRouter initialEntries={["/conversations/1"]}>
          <Routes>
            <Route path="/conversations/:conversationId" element={<ConversationDetailPage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>,
    );
    expect(await screen.findByText("This conversation is unavailable.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to inbox" })).toHaveAttribute(
      "href",
      "/conversations",
    );
    expect(screen.queryByText("Last message")).not.toBeInTheDocument();
  });
  it.each([
    ["timeout", "The request timed out. Try again."],
    ["transport", "Could not load conversations. Check your connection and try again."],
  ] as const)(
    "recovers inbox from %s without presenting an empty result",
    async (category, label) => {
      mocked.owner.listConversations
        .mockRejectedValueOnce(new ApiError(category))
        .mockResolvedValueOnce({
          items: [row("1", "Recovered inbox")],
          has_more: false,
        });
      render(view());
      expect(await screen.findByText(label)).toBeInTheDocument();
      expect(screen.queryByText("No conversations yet.")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      expect(await screen.findByText("Recovered inbox")).toBeInTheDocument();
    },
  );
  it.each([
    ["timeout", "The request timed out. Try again."],
    ["transport", "Could not load conversations. Check your connection and try again."],
  ] as const)("recovers detail from %s without stale content", async (category, label) => {
    mocked.owner.getConversation
      .mockRejectedValueOnce(new ApiError(category))
      .mockResolvedValueOnce(row("1", "Recovered detail"));
    render(
      <I18nextProvider i18n={createI18n("en")}>
        <MemoryRouter initialEntries={["/conversations/1"]}>
          <Routes>
            <Route path="/conversations/:conversationId" element={<ConversationDetailPage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>,
    );
    expect(await screen.findByText(label)).toBeInTheDocument();
    expect(screen.queryByText("Last message")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Recovered detail")).toBeInTheDocument();
  });
});
