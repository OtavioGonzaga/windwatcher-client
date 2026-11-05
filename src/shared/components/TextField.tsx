import { useId } from "react";
import type { ComponentPropsWithRef } from "react";

type TextFieldProps = ComponentPropsWithRef<"input"> & {
  label: string;
  hint?: string;
  error?: string;
};

export function TextField({
  label,
  hint,
  error,
  id,
  className = "",
  "aria-describedby": describedBy,
  ...props
}: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const descriptions =
    [describedBy, hint ? `${inputId}-hint` : undefined, error ? `${inputId}-error` : undefined]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div className="flex min-w-0 flex-col gap-2 text-sm">
      <label htmlFor={inputId} className="font-medium">
        {label}
      </label>
      {hint && (
        <p id={`${inputId}-hint`} className="text-secondary">
          {hint}
        </p>
      )}
      <input
        {...props}
        id={inputId}
        aria-describedby={descriptions}
        aria-invalid={error ? true : props["aria-invalid"]}
        className={`min-h-[var(--control-height)] w-full min-w-0 rounded-sm border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted disabled:bg-disabled disabled:text-on-disabled ${className}`}
      />
      {error && (
        <p id={`${inputId}-error`} className="text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
