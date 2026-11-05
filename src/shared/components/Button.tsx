import type { ComponentPropsWithRef } from "react";

export type ButtonProps = ComponentPropsWithRef<"button"> & {
  variant?: "primary" | "secondary" | "destructive";
};
const variants = {
  primary:
    "border-transparent bg-action text-on-action hover:bg-action-hover active:bg-action-pressed",
  secondary:
    "border-border bg-surface text-foreground hover:bg-subtle-hover active:bg-subtle-hover",
  destructive: "border-danger bg-danger-surface text-danger hover:underline active:underline",
};

export function Button({
  type = "button",
  variant = "secondary",
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={`inline-flex min-h-[var(--control-height)] min-w-11 items-center justify-center gap-2 rounded-sm border px-4 py-2 text-sm font-medium whitespace-normal break-words transition-colors duration-[var(--motion-duration)] ease-out disabled:cursor-not-allowed disabled:border-border disabled:bg-disabled disabled:text-on-disabled disabled:no-underline ${variants[variant]} ${className}`}
    />
  );
}
