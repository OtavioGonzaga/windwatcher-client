import { describe, expect, it } from "vitest";
import { grant, user } from "../../../tests/fixtures/authentication";
import {
  decodeSessionGrant,
  decodeUserIdentity,
  MAX_ACCESS_TOKEN_BYTES,
  refreshToken,
  utcTimestamp,
} from "./validation";

describe("authentication runtime boundary", () => {
  it("accepts UUIDv7 and copies only a complete validated grant/identity", () => {
    expect(decodeSessionGrant(grant)).toEqual(grant);
    expect(decodeSessionGrant(grant)).not.toBe(grant);
    expect(decodeUserIdentity(user)).toEqual(user);
    const { disabled_at: _disabled, ...enabled } = user;
    expect(decodeUserIdentity(enabled)).toEqual(enabled);
    expect(
      decodeSessionGrant({ ...grant, access_token_expires_at: grant.session_expires_at }),
    ).toMatchObject({ access_token_expires_at: grant.session_expires_at });
  });
  it.each([
    null,
    [],
    {},
    { ...grant, token_type: "bearer" },
    { ...grant, token_type: "Basic" },
    { ...grant, session_id: "00000000-0000-0000-0000-000000000000" },
    { ...grant, session_id: "019a0000-0000-7000-0000-000000000002" },
    { ...grant, session_id: "../account" },
    { ...grant, access_token: "" },
    { ...grant, access_token: "Bearer a.b.c" },
    { ...grant, access_token: "a.b.c\n" },
    { ...grant, access_token: "é.b.c" },
    { ...grant, access_token: "a.b" },
    { ...grant, access_token: `a.${"b".repeat(MAX_ACCESS_TOKEN_BYTES)}.c` },
    { ...grant, refresh_token: "A".repeat(42) },
    { ...grant, refresh_token: `${"A".repeat(43)}=` },
    { ...grant, refresh_token: `${"A".repeat(42)}B` },
    { ...grant, refresh_token: "+".repeat(43) },
    { ...grant, access_token_expires_at: "2027-01-01T00:00:00Z" },
    { ...grant, access_token_expires_at: "1970-01-01T00:00:00Z" },
    { ...grant, future_secret: "must not survive" },
    { ...grant, access_token: undefined },
  ])("rejects malformed or unsupported grants without retaining their values (%#)", (value) => {
    expect(() => decodeSessionGrant(value)).toThrow("Invalid authentication response.");
  });
  it.each([
    "2026-11-06T12:00:00Z",
    "2026-11-06T12:00:00+00:00",
    "2026-11-06T12:00:00.123456789Z",
    "2024-02-29T12:00:00.1Z",
  ])("accepts UTC server timestamps including nanoseconds: %s", (value) => {
    expect(utcTimestamp(value)).toBe(value);
  });
  it.each([
    "2026-02-29T00:00:00Z",
    "2026-04-31T00:00:00Z",
    "2026-01-01T24:00:00Z",
    "2026-01-01T00:00:60Z",
    "2026-01-01",
    "2026-01-01T00:00:00",
    "2026-01-01T00:00:00-00:00",
    "2026-01-01T00:00:00+01:00",
    "2026-01-01T00:00:00.1234567890Z",
    "2026-01-01T00:00:00Z\n",
  ])("rejects normalized, non-UTC or malformed timestamps: %s", (value) => {
    expect(() => utcTimestamp(value)).toThrow("Invalid authentication response.");
  });
  it.each([
    { ...user, id: "alice" },
    { ...user, username: "" },
    { ...user, username: " alice" },
    { ...user, username: "a\u202eb" },
    { ...user, username: "a".repeat(129) },
    { ...user, updated_at: "2025-01-01T00:00:00Z" },
    { ...user, disabled_at: false },
    { ...user, disabled_at: "2025-01-01T00:00:00Z" },
    { ...user, password: "not allowed" },
    { ...user, created_at: undefined },
  ])("rejects malformed identity payloads (%#)", (value) => {
    expect(() => decodeUserIdentity(value)).toThrow("Invalid authentication response.");
  });
  it("preserves an explicitly disabled identity for the coordinator to reject", () => {
    expect(decodeUserIdentity({ ...user, disabled_at: user.updated_at }).disabled_at).toBe(
      user.updated_at,
    );
  });
  it("checks canonical refresh padding bits, not only length/alphabet", () => {
    for (const last of "AEIMQUYcgkosw048")
      expect(refreshToken(`${"A".repeat(42)}${last}`)).toHaveLength(43);
    for (const last of "BCDFGHJKLNOPRSTVWXZabdefhij lmnprtuvxyz1235679".replaceAll(" ", "")) {
      expect(() => refreshToken(`${"A".repeat(42)}${last}`)).toThrow();
    }
  });
});
