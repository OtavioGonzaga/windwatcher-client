import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Providers } from "../../app/Providers";
import { createI18n } from "../../shared/i18n";
import { AddServerPage } from "./AddServerPage";

const mock = vi.hoisted(() => ({ discover: vi.fn(), transport: vi.fn() }));
vi.mock("./discover-server", () => ({ discoverServer: mock.discover }));
vi.mock("../../shared/platform/http", () => ({ platformHttp: async () => mock.transport }));

function mount() {
  return render(
    <StrictMode>
      <Providers i18n={createI18n("en")}>
        <AddServerPage />
      </Providers>
    </StrictMode>,
  );
}

describe("manual inspection lifecycle", () => {
  it("does not inspect invalid input or while typing", () => {
    mock.discover.mockReset();
    mount();
    fireEvent.change(screen.getByLabelText("Server URL"), {
      target: { value: "https://example.org/v1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check server" }));
    expect(screen.getByText(/valid HTTP\(S\) server root/)).toBeVisible();
    expect(mock.discover).not.toHaveBeenCalled();
  });
  it("invalidates a late result after the input changes", async () => {
    mock.discover.mockReset();
    let resolve: (value: unknown) => void = () => {};
    mock.discover.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    mount();
    const field = screen.getByLabelText("Server URL");
    fireEvent.change(field, { target: { value: "http://example.org/proxy" } });
    expect(screen.getByText(/HTTP is not encrypted/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Check server" }));
    await waitFor(() => expect(mock.discover).toHaveBeenCalledOnce());
    const signal = mock.discover.mock.calls[0]?.[2];
    fireEvent.change(field, { target: { value: "https://other.example" } });
    expect(signal.aborted).toBe(true);
    await act(async () => {
      resolve({
        kind: "supported",
        root: "http://example.org/proxy/",
        metadata: { registration: "open" },
      });
    });
    expect(screen.queryByText(/advertises Windwatcher v1/)).not.toBeInTheDocument();
    expect(screen.getByText(/https:\/\/other.example\/v1\/instance/)).toBeVisible();
  });
  it("requires acknowledgment before the unverified legacy summary", async () => {
    mock.discover
      .mockReset()
      .mockResolvedValue({ kind: "legacy", root: "https://example.org/", recognized: false });
    mount();
    fireEvent.change(screen.getByLabelText("Server URL"), {
      target: { value: "https://example.org" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check server" }));
    await screen.findByText(/cannot be confirmed/);
    expect(screen.queryByText(/Login and registration may be available/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByText(/Login and registration may be available/)).toBeVisible();
  });
});
