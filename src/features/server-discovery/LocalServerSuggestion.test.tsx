import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "../../app/Providers";
import { createI18n } from "../../shared/i18n";
import { AddServerPage } from "./AddServerPage";
import type { LocalCandidate } from "./local-discovery";

const mock = vi.hoisted(() => ({ scan: vi.fn(), manual: vi.fn(), transport: vi.fn() }));
vi.mock("./local-discovery", () => ({ discoverLocalServers: mock.scan }));
vi.mock("./discover-server", async (original) => ({
  ...(await original<typeof import("./discover-server")>()),
  discoverServer: mock.manual,
}));
vi.mock("../../shared/platform/native-target", () => ({ canDiscoverLocalServer: () => true }));
vi.mock("../../shared/platform/http", () => ({ platformHttp: async () => mock.transport }));
const root = "http://127.0.0.1:8080/";
function mount(language: "en" | "pt-BR" | "es" | "de" = "en") {
  return render(
    <StrictMode>
      <Providers i18n={createI18n(language)}>
        <AddServerPage />
      </Providers>
    </StrictMode>,
  );
}
beforeEach(() => {
  mock.scan.mockReset();
  mock.manual.mockReset();
});
function answer(...candidates: LocalCandidate[]) {
  mock.scan.mockImplementation(async (_transport, _signal, notify) => {
    candidates.forEach((candidate) => notify(candidate));
    return candidates;
  });
}
describe("page-local Linux advice", () => {
  it("keeps manual input usable and selects only on explicit action, without verification or saving", async () => {
    answer({ root, kind: "supported", readiness: "ready" });
    mount();
    const field = screen.getByLabelText("Server URL");
    field.focus();
    const use = await screen.findByRole("button", { name: `Use this address: ${root}` });
    expect(field).toHaveValue("");
    expect(field).toHaveFocus();
    expect(mock.scan).toHaveBeenCalledOnce(); // StrictMode's disposed effect never starts I/O.
    fireEvent.click(use);
    expect(field).toHaveValue(root);
    expect(field).toHaveFocus();
    expect(mock.manual).not.toHaveBeenCalled();
    expect(screen.getByText(/HTTP is not encrypted/)).toBeVisible();
    expect(localStorage.length + sessionStorage.length).toBe(0);
  });
  it.each(["not-ready", "unknown"] as const)(
    "shows %s diagnostically without offering selection",
    async (readiness) => {
      answer({ root, kind: "supported", readiness });
      mount();
      await screen.findByText(root);
      expect(screen.queryByRole("button", { name: /Use this address/ })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Check again" })).toBeEnabled();
    },
  );
  it("recognized legacy selection still requires manual inspection and acknowledgment", async () => {
    answer({ root, kind: "legacy" });
    mock.manual.mockResolvedValue({ root, kind: "legacy", recognized: true });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: `Use this address: ${root}` }));
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Check server" }));
    const checkbox = await screen.findByRole("checkbox");
    expect(checkbox).not.toBeChecked();
    expect(screen.queryByText(/Login and registration may be available/)).not.toBeInTheDocument();
    fireEvent.click(checkbox);
    expect(screen.getByText(/Login and registration may be available/)).toBeVisible();
  });
  it("invalidates old callbacks on dismiss, rescan, manual editing and unmount", async () => {
    mock.scan.mockImplementation(() => new Promise(() => {}));
    const view = mount();
    await waitFor(() => expect(mock.scan).toHaveBeenCalledOnce());
    const first = mock.scan.mock.calls[0];
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(first?.[1].aborted).toBe(true);
    expect(screen.getByRole("button", { name: "Check again" })).toHaveFocus();
    await act(async () => {
      first?.[2]({ root, kind: "supported", readiness: "ready" });
    });
    expect(screen.queryByText(root)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await waitFor(() => expect(mock.scan).toHaveBeenCalledTimes(2));
    const second = mock.scan.mock.calls[1];
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await waitFor(() => expect(mock.scan).toHaveBeenCalledTimes(3));
    expect(second?.[1].aborted).toBe(true);
    const third = mock.scan.mock.calls[2];
    fireEvent.change(screen.getByLabelText("Server URL"), {
      target: { value: "https://mine.test" },
    });
    expect(third?.[1].aborted).toBe(true);
    await act(async () => {
      second?.[2]({ root, kind: "supported", readiness: "ready" });
      third?.[2]({ root, kind: "supported", readiness: "ready" });
    });
    expect(screen.getByLabelText("Server URL")).toHaveValue("https://mine.test");
    expect(screen.queryByRole("button", { name: /Use this address/ })).not.toBeInTheDocument();
    expect(mock.scan).toHaveBeenCalledTimes(3);
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await waitFor(() => expect(mock.scan).toHaveBeenCalledTimes(4));
    view.unmount();
    expect(mock.scan.mock.calls[3]?.[1].aborted).toBe(true);
  });
  it.each([
    ["en", "Use this address"],
    ["pt-BR", "Usar este endereço"],
    ["es", "Usar esta dirección"],
    ["de", "Diese Adresse verwenden"],
  ] as const)(
    "distinguishes both addresses accessibly while preserving visible %s labels",
    async (language, label) => {
      const ipv6 = "http://[::1]:8080/";
      answer(
        { root, kind: "supported", readiness: "ready" },
        { root: ipv6, kind: "supported", readiness: "ready" },
      );
      mount(language);
      const first = await screen.findByRole("button", { name: `${label}: ${root}` });
      const second = screen.getByRole("button", { name: `${label}: ${ipv6}` });
      expect(first).toBeVisible();
      expect(second).toBeVisible();
      expect(first).toHaveAccessibleName(`${label}: ${root}`);
      expect(second).toHaveAccessibleName(`${label}: ${ipv6}`);
      expect(first).toHaveTextContent(label);
      expect(second).toHaveTextContent(label);
      fireEvent.click(second);
      expect(screen.getByRole("textbox")).toHaveValue(ipv6);
      expect(screen.getByRole("textbox")).toHaveFocus();
    },
  );
  it("keeps foreign and inconclusive responders behind the compact truthful summary", async () => {
    answer({ root, kind: "wrong-service" }, { root: "http://[::1]:8080/", kind: "unknown" });
    mount();
    expect(await screen.findByText(/No compatible local server found/)).toBeVisible();
    expect(screen.queryByText(root)).not.toBeInTheDocument();
    expect(screen.queryByText("http://[::1]:8080/")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Use this address/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check again" })).toBeEnabled();
  });
});
