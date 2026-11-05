import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";
import { IconButton } from "./IconButton";
import { TextField } from "./TextField";
import { InlineNotice } from "./InlineNotice";

describe("native UI primitives", () => {
  it("preserves button type, refs, disabled and explicit icon labels", () => {
    const action = vi.fn();
    const ref = createRef<HTMLButtonElement>();
    render(
      <>
        <Button ref={ref} onClick={action}>
          Reset
        </Button>
        <Button disabled onClick={action}>
          Disabled
        </Button>
        <IconButton label="Clear">
          <svg />
        </IconButton>
      </>,
    );
    expect(ref.current).toBe(screen.getByRole("button", { name: "Reset" }));
    expect(ref.current).toHaveAttribute("type", "button");
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    fireEvent.click(screen.getByRole("button", { name: "Disabled" }));
    expect(action).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Clear" }).firstElementChild).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("connects stable labels, descriptions, errors and native input props", () => {
    const ref = createRef<HTMLInputElement>();
    const { rerender } = render(
      <TextField
        ref={ref}
        label="Address"
        hint="Include protocol"
        error="Incomplete"
        aria-describedby="external"
      />,
    );
    const input = screen.getByRole("textbox", { name: "Address" });
    const id = input.id;
    expect(ref.current).toBe(input);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", `external ${id}-hint ${id}-error`);
    rerender(<TextField label="Address" hint="Include protocol" disabled />);
    expect(input.id).toBe(id);
    expect(input).toBeDisabled();
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).toHaveAttribute("aria-describedby", `${id}-hint`);
  });

  it("does not announce static notices; actual updates can be polite", () => {
    const { rerender } = render(<InlineNotice tone="warning">Warning: example only</InlineNotice>);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    rerender(
      <InlineNotice tone="success" announce="polite">
        Reset completed
      </InlineNotice>,
    );
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });
});
