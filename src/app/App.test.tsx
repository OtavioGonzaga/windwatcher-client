import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router";
import { App } from "./App";
import { Providers } from "./Providers";
import { createI18n } from "../shared/i18n";

describe("application routes", () => {
  it.each([
    ["/", "Windwatcher"],
    ["/preferences", "Preferences"],
    ["/unknown", "Page not found"],
  ])("renders %s", (path, heading) => {
    render(
      <Providers i18n={createI18n("en")}>
        <MemoryRouter initialEntries={[path]}>
          <App />
        </MemoryRouter>
      </Providers>,
    );
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(heading);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
