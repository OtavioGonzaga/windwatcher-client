import type { components } from "../../shared/api/schema.generated";

export type SessionGrant = components["schemas"]["SessionGrantResponse"];
export type UserIdentity = components["schemas"]["UserResponse"];

// Client resource budgets, not configurable server lifetime/password policies.
export const MAX_ACCESS_TOKEN_BYTES = 8192;
export const MAX_GRANT_RESPONSE_BYTES = 16_384;
export const MAX_USER_RESPONSE_BYTES = 4096;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const encoder = new TextEncoder();

function requireValid(value: unknown): asserts value {
  // Never include network values (especially credentials) in validation errors.
  if (!value) throw new Error("Invalid authentication response.");
}
function object(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  requireValid(typeof value === "object" && value !== null && !Array.isArray(value));
  requireValid(Object.keys(value).every((key) => keys.includes(key)));
}
export function serverUuid(value: unknown): string {
  requireValid(typeof value === "string" && UUID.test(value));
  return value;
}

/** UTC RFC3339, including the server's nanosecond precision; no Date.parse normalization. */
export function utcTimestamp(value: unknown): string {
  requireValid(typeof value === "string" && value.length <= 35);
  const match = /^(\d{4}-\d\d-\d\d)T(\d\d:\d\d:\d\d)(?:\.(\d{1,9}))?(?:Z|\+00:00)$/.exec(value);
  requireValid(match);
  const millis = (match[3] ?? "").padEnd(3, "0").slice(0, 3);
  const normalized = `${match[1]}T${match[2]}.${millis}Z`;
  const time = Date.parse(normalized);
  requireValid(Number.isFinite(time) && new Date(time).toISOString() === normalized);
  return value;
}

export function accessToken(value: unknown): string {
  requireValid(
    typeof value === "string" &&
      value.length <= MAX_ACCESS_TOKEN_BYTES &&
      encoder.encode(value).byteLength <= MAX_ACCESS_TOKEN_BYTES &&
      /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value),
  );
  // Shape/size only: the client does not verify JWT signatures or trust decoded claims.
  return value;
}
export function refreshToken(value: unknown): string {
  // 32 bytes: the final base64url sextet must have two zero padding bits.
  requireValid(typeof value === "string" && /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(value));
  return value;
}

/** Reject unknown fields rather than accidentally retaining secret-bearing extensions. */
export function decodeSessionGrant(value: unknown): SessionGrant {
  object(value, [
    "access_token",
    "access_token_expires_at",
    "refresh_token",
    "session_expires_at",
    "session_id",
    "token_type",
  ]);
  const grant = value;
  const accessExpiry = utcTimestamp(grant.access_token_expires_at);
  const sessionExpiry = utcTimestamp(grant.session_expires_at);
  requireValid(
    Date.parse(accessExpiry) > 0 && Date.parse(accessExpiry) <= Date.parse(sessionExpiry),
  );
  requireValid(grant.token_type === "Bearer");
  return {
    access_token: accessToken(grant.access_token),
    access_token_expires_at: accessExpiry,
    refresh_token: refreshToken(grant.refresh_token),
    session_expires_at: sessionExpiry,
    session_id: serverUuid(grant.session_id),
    token_type: "Bearer",
  };
}

export function decodeUserIdentity(value: unknown): UserIdentity {
  object(value, ["id", "username", "created_at", "updated_at", "disabled_at"]);
  const user = value;
  requireValid(
    typeof user.username === "string" &&
      user.username.trim() === user.username &&
      Array.from(user.username).length >= 1 &&
      Array.from(user.username).length <= 128 &&
      encoder.encode(user.username).byteLength <= 512 &&
      !/[\p{Cc}\p{Cf}\p{Cs}]/u.test(user.username),
  );
  const created = utcTimestamp(user.created_at);
  const updated = utcTimestamp(user.updated_at);
  requireValid(Date.parse(updated) >= Date.parse(created));
  const disabled =
    user.disabled_at === undefined || user.disabled_at === null
      ? user.disabled_at
      : utcTimestamp(user.disabled_at);
  if (disabled) requireValid(Date.parse(disabled) >= Date.parse(created));
  return {
    id: serverUuid(user.id),
    username: user.username,
    created_at: created,
    updated_at: updated,
    ...(disabled === undefined ? {} : { disabled_at: disabled }),
  };
}
