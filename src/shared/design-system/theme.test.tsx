import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, resolveTheme, useTheme } from "./theme";

afterEach(() => vi.unstubAllGlobals());

function Control() {
  const { mode, theme, setMode } = useTheme();
  return (
    <button onClick={() => setMode(mode === "system" ? "light" : "system")}>
      {mode}:{theme}
    </button>
  );
}

describe("appearance", () => {
  it.each([true, false])("resolves explicit overrides independently of OS=%s", (dark) => {
    expect(resolveTheme("light", dark)).toBe("light");
    expect(resolveTheme("dark", dark)).toBe("dark");
    expect(resolveTheme("system", dark)).toBe(dark ? "dark" : "light");
  });

  it("tracks OS changes only for effective system mode and cleans up its listener", () => {
    let matches = true;
    const listeners = new Set<() => void>();
    vi.stubGlobal("matchMedia", () => ({
      get matches() {
        return matches;
      },
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    }));
    const { unmount } = render(
      <ThemeProvider>
        <Control />
      </ThemeProvider>,
    );
    expect(screen.getByRole("button")).toHaveTextContent("system:dark");
    fireEvent.click(screen.getByRole("button"));
    expect(document.documentElement.dataset.theme).toBe("light");
    act(() => {
      matches = false;
      listeners.forEach((listener) => listener());
    });
    act(() => {
      matches = true;
      listeners.forEach((listener) => listener());
    });
    expect(screen.getByRole("button")).toHaveTextContent("light:light");
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toHaveTextContent("system:dark");
    unmount();
    expect(listeners.size).toBe(0);
  });
});
