import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router";
import { App } from "./App";
import { Providers } from "./Providers";
import { createI18n } from "../shared/i18n";
import { locales } from "../shared/i18n/locale";

describe("application routes", () => {
  it.each(locales)("localizes navigation and active destination in %s", (locale) => {
    const i18n = createI18n(locale);
    render(
      <Providers i18n={i18n}>
        <MemoryRouter initialEntries={["/preferences"]}>
          <App />
        </MemoryRouter>
      </Providers>,
    );
    expect(
      screen.getByRole("navigation", { name: i18n.t("navigation.label") }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: i18n.t("navigation.preferences") })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("heading", { level: 1 })).not.toHaveFocus();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
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
