import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { RouteErrorBoundary } from "./RouteErrorBoundary";
import { Providers } from "./Providers";
import { createI18n } from "../shared/i18n";

function Broken(): never {
  throw new Error("sensitive diagnostic");
}

describe("route render recovery", () => {
  it("shows translated recovery without exposing exception text", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      render(
        <Providers i18n={createI18n("de")}>
          <MemoryRouter>
            <RouteErrorBoundary>
              <Broken />
            </RouteErrorBoundary>
          </MemoryRouter>
        </Providers>,
      );
      expect(screen.getByRole("heading")).toHaveTextContent(
        "Diese Seite konnte nicht angezeigt werden.",
      );
      expect(screen.getByRole("link", { name: "Zur Startseite" })).toHaveAttribute("href", "/");
      expect(screen.queryByText(/sensitive diagnostic/)).not.toBeInTheDocument();
    } finally {
      consoleError.mockRestore();
    }
  });
});
