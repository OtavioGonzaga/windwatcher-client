import type { SessionError } from "./service";

/** Translate only vetted categories, never server-provided messages. */
export function errorKey(category: SessionError) {
  if (category === "invalid-credentials") return "credentials";
  if (category === "disabled") return "disabled";
  if (category === "username-taken") return "usernameTaken";
  if (category === "invalid-username") return "username";
  if (category === "invalid-password") return "password";
  if (category === "registration-closed") return "registrationClosed";
  if (category === "identity") return "identity";
  if (category === "recovery-required") return "recovery";
  if (category === "expired") return "expired";
  if (category === "missing") return "missing";
  if (category === "coordination") return "coordination";
  if (category === "clock") return "clock";
  if (category === "storage-locked") return "locked";
  if (category === "storage-too-large") return "capacity";
  if (category.startsWith("storage-")) return "storage";
  if (category === "invalid-access" || category === "invalid-refresh") return "session";
  if (category === "malformed") return "malformed";
  if (category === "too-large") return "requestTooLarge";
  if (
    category === "network" ||
    category === "timeout" ||
    category === "redirect" ||
    category === "rate-limited" ||
    category === "server"
  )
    return category;
  if (category === "bad-request" || category === "invalid-input") return "request";
  return "unknown";
}
