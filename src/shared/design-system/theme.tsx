import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type Appearance = "system" | "light" | "dark";
export type Theme = Exclude<Appearance, "system">;
export const colorSchemeQuery = "(prefers-color-scheme: dark)";

export function resolveTheme(mode: Appearance, dark: boolean): Theme {
  return mode === "system" ? (dark ? "dark" : "light") : mode;
}

function prefersDark(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(colorSchemeQuery).matches
    : false;
}

/** Called before React mounts; no inline script or persisted preferences. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  const color = getComputedStyle(document.documentElement).getPropertyValue("--background").trim();
  if (color) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
}

export function initializeTheme(): void {
  applyTheme(resolveTheme("system", prefersDark()));
}

const ThemeContext = createContext<{
  mode: Appearance;
  theme: Theme;
  setMode: (mode: Appearance) => void;
} | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Appearance>("system");
  const [dark, setDark] = useState(prefersDark);
  const theme = resolveTheme(mode, dark);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia(colorSchemeQuery);
    const change = () => setDark(media.matches);
    change();
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => applyTheme(theme), [theme]);
  const value = useMemo(() => ({ mode, theme, setMode }), [mode, theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("ThemeProvider is required.");
  return value;
}
