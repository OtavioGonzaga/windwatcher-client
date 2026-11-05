import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("bootstrap screen", () => {
  it("exposes one application landmark and the product name", () => {
    render(<App />);
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Windwatcher");
  });

  it("uses the supplied artwork without offering unimplemented workflows", () => {
    const { container } = render(<App />);
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      `${import.meta.env.BASE_URL}brand/windwatcher-banner.png`,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
