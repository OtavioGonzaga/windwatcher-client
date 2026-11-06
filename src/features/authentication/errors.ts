import { ApiError } from "../../shared/api/error";

export type AuthFailure =
  | "invalid-credentials"
  | "disabled"
  | "invalid-refresh"
  | "invalid-access"
  | "registration-closed"
  | "username-taken"
  | "invalid-username"
  | "invalid-password"
  | "bad-request"
  | "unauthorized"
  | "forbidden"
  | "conflict"
  | "too-large"
  | "unsupported-media"
  | "invalid-input"
  | "rate-limited"
  | "server"
  | "timeout"
  | "cancelled"
  | "network"
  | "redirect"
  | "malformed"
  | "unknown";

// Exact codes checked against the pinned server source, not server-provided prose.
const codes: Readonly<Record<string, readonly [number, AuthFailure]>> = {
  "auth.invalid_credentials": [401, "invalid-credentials"],
  "auth.user_disabled": [403, "disabled"],
  "auth.invalid_refresh_token": [401, "invalid-refresh"],
  "auth.invalid_access_token": [401, "invalid-access"],
  "registration.closed": [403, "registration-closed"],
  "user.username_taken": [409, "username-taken"],
  "user.invalid_username": [422, "invalid-username"],
  "user.invalid_password": [422, "invalid-password"],
};
const statuses: Readonly<Record<number, AuthFailure>> = {
  400: "bad-request",
  401: "unauthorized",
  403: "forbidden",
  409: "conflict",
  413: "too-large",
  415: "unsupported-media",
  422: "invalid-input",
  429: "rate-limited",
};

/** Safe semantic category only; UI must never render raw Error.message or Problem Details. */
export function authFailure(error: unknown): AuthFailure {
  if (!(error instanceof ApiError)) return "unknown";
  if (error.category === "http") {
    const { code, status } = error.metadata;
    const mapped = code === undefined || !Object.hasOwn(codes, code) ? undefined : codes[code];
    if (mapped && mapped[0] === status) return mapped[1];
    if (status !== undefined && status >= 500) return "server";
    return status === undefined ? "unknown" : (statuses[status] ?? "unknown");
  }
  switch (error.category) {
    case "transport":
      return "network";
    case "invalid-response":
    case "response-too-large":
      return "malformed";
    default:
      return error.category;
  }
}
