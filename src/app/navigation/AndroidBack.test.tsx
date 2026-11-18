import { act, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { createI18n } from "../../shared/i18n";
import { AndroidBack } from "./AndroidBack";

const adapter = vi.hoisted(() => ({ subscribeBack: vi.fn(), finishActivity: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true }));
vi.mock("../../shared/platform/android-back", () => adapter);
afterEach(() => vi.restoreAllMocks());
it("direct Group creation entry uses the existing inbox Back fallback", async () => {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Android");
  let back!: (canGoBack: boolean) => void;
  adapter.subscribeBack.mockImplementation((handler: (canGoBack: boolean) => void) => {
    back = handler;
    return () => {};
  });
  render(
    <I18nextProvider i18n={createI18n("en")}>
      <MemoryRouter initialEntries={["/conversations/groups/new"]}>
        <AndroidBack />
        <Routes>
          <Route path="/conversations/groups/new" element={<p>Group form</p>} />
          <Route path="/conversations" element={<p>Inbox fallback</p>} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
  await waitFor(() => expect(adapter.subscribeBack).toHaveBeenCalled());
  act(() => back(true));
  expect(await screen.findByText("Inbox fallback")).toBeInTheDocument();
  expect(adapter.finishActivity).not.toHaveBeenCalled();
});
it("Back closes an open Group action review without confirming or leaving the detail", async () => {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Android");
  let back!: (canGoBack: boolean) => void;
  adapter.subscribeBack.mockImplementation((handler: (canGoBack: boolean) => void) => {
    back = handler;
    return () => {};
  });
  const send = vi.fn();
  render(
    <I18nextProvider i18n={createI18n("en")}>
      <MemoryRouter initialEntries={["/conversations/group"]}>
        <AndroidBack />
        <Routes>
          <Route
            path="/conversations/group"
            element={
              <>
                <p>Group detail</p>
                <dialog open aria-label="Review group action">
                  <button onClick={send}>Confirm</button>
                </dialog>
              </>
            }
          />
          <Route path="/conversations" element={<p>Inbox fallback</p>} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
  const dialog = screen.getByRole("dialog");
  Object.defineProperty(dialog, "close", {
    configurable: true,
    value() {
      dialog.removeAttribute("open");
    },
  });
  await waitFor(() => expect(back).toBeDefined());
  act(() => back(true));
  expect(screen.getByText("Group detail")).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(send).not.toHaveBeenCalled();
});
