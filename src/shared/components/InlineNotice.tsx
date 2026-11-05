import type { ComponentPropsWithRef } from "react";

type NoticeProps = Omit<ComponentPropsWithRef<"div">, "role" | "aria-live"> & {
  tone?: "info" | "warning" | "error" | "success";
  announce?: "polite";
};
const tones = {
  info: "bg-info-surface text-info",
  warning: "bg-warning-surface text-warning",
  error: "bg-danger-surface text-danger",
  success: "bg-success-surface text-success",
};

/** Static guidance is not an alert. Opt into polite announcements for actual updates. */
export function InlineNotice({ tone = "info", announce, className = "", ...props }: NoticeProps) {
  return (
    <div
      {...props}
      data-notice={tone}
      role={announce ? "status" : undefined}
      aria-live={announce}
      className={`rounded-md border-l-2 border-current px-4 py-3 text-sm break-words ${tones[tone]} ${className}`}
    />
  );
}
