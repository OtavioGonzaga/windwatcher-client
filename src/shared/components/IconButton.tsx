import { Button } from "./Button";
import type { ButtonProps } from "./Button";
import type { ReactNode } from "react";

type IconButtonProps = Omit<ButtonProps, "children" | "aria-label" | "aria-labelledby"> & {
  label: string;
  children: ReactNode;
};

export function IconButton({ label, children, className = "", ...props }: IconButtonProps) {
  return (
    <Button {...props} aria-label={label} className={`shrink-0 px-2 ${className}`}>
      <span aria-hidden="true">{children}</span>
    </Button>
  );
}
