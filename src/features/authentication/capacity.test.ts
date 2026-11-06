import { describe, expect, it } from "vitest";
import { grant, user } from "../../../tests/fixtures/authentication";
import {
  measureSessionEnvelope,
  windowsCredentialBlobBytes,
  WINDOWS_CREDENTIAL_BLOB_BYTES,
  WINDOWS_KEYRING_INPUT_BYTES,
} from "./capacity";

const binding = {
  accountId: "550e8400-e29b-41d4-a716-446655440000",
  profileId: "550e8400-e29b-41d4-a716-446655440001",
  userId: user.id,
  operationId: "550e8400-e29b-41d4-a716-446655440002",
  generation: 1,
};

describe("Windows credential capacity gate", () => {
  it.each([1, 2, 3, 4, 959, 960, 961, 1024, 16_384])(
    "matches the actual Base64 and UTF-16 encoding for %s bytes",
    (length) => {
      const encoded = Buffer.from(new Uint8Array(length)).toString("base64");
      expect(windowsCredentialBlobBytes(length)).toBe(Buffer.byteLength(encoded, "utf16le"));
    },
  );
  it("establishes the exact 960-byte boundary, not a made-up 16 KiB provider guarantee", () => {
    expect(windowsCredentialBlobBytes(WINDOWS_KEYRING_INPUT_BYTES)).toBe(
      WINDOWS_CREDENTIAL_BLOB_BYTES,
    );
    expect(windowsCredentialBlobBytes(WINDOWS_KEYRING_INPUT_BYTES + 1)).toBe(2568);
  });
  it.each([-1, 1.5, NaN, Infinity, 16_385])("rejects invalid lengths (%s)", (length) => {
    expect(() => windowsCredentialBlobBytes(length)).toThrow("Invalid credential length.");
  });
  it("measures an actually serialized envelope with all binding and rotation fields", () => {
    const result = measureSessionEnvelope(grant, binding);
    const encoded = JSON.stringify([
      1,
      binding.accountId,
      binding.profileId,
      binding.userId,
      binding.operationId,
      1,
      grant.session_id,
      "Bearer",
      grant.access_token,
      grant.refresh_token,
      grant.access_token_expires_at,
      grant.session_expires_at,
    ]);
    expect(result.envelopeBytes).toBe(new TextEncoder().encode(encoded).byteLength);
    expect(result.legacyWindowsBlobBytes).toBe(
      Buffer.byteLength(Buffer.from(encoded).toString("base64"), "utf16le"),
    );
    expect(result.fitsLegacyWindowsProvider).toBe(true);
    expect(result.fitsWindowsDpapiByteBudget).toBe(true);
    expect(JSON.stringify(result)).not.toContain(grant.refresh_token);
    expect(JSON.stringify(result)).not.toContain(grant.access_token);
  });
  it("fails the gate for oversized grants without truncation or splitting", () => {
    const long = { ...grant, access_token: `synthetic.${"a".repeat(1500)}.signature` };
    const result = measureSessionEnvelope(long, binding);
    expect(result.fitsLegacyWindowsProvider).toBe(false);
    expect(result.fitsWindowsDpapiByteBudget).toBe(true);
    expect(result.accessTokenBytes).toBe(long.access_token.length);
    expect(result.envelopeBytes).toBeGreaterThan(result.accessTokenBytes);
    expect(long.access_token).toHaveLength(1520);
  });
  it("includes the cost of future generation widths and full-precision server timestamps", () => {
    const short = measureSessionEnvelope(grant, binding);
    const precise = measureSessionEnvelope(
      {
        ...grant,
        access_token_expires_at: "2026-11-06T12:15:00.123456789Z",
        session_expires_at: "2026-12-06T12:00:00.123456789Z",
      },
      { ...binding, generation: Number.MAX_SAFE_INTEGER },
    );
    expect(precise.envelopeBytes - short.envelopeBytes).toBe(35);
  });
  it("validates the grant and safe binding rather than estimating arbitrary input", () => {
    expect(() => measureSessionEnvelope({ ...grant, token_type: "Basic" }, binding)).toThrow();
    expect(() => measureSessionEnvelope(grant, { ...binding, generation: 0 })).toThrow();
    expect(() => measureSessionEnvelope(grant, { ...binding, accountId: "../alias" })).toThrow();
    expect(() => measureSessionEnvelope(grant, { ...binding, userId: "alice" })).toThrow();
  });
  it("fits the maximum accepted wire JWT plus bindings in the DPAPI byte budget", () => {
    const result = measureSessionEnvelope(
      { ...grant, access_token: `a.${"x".repeat(8188)}.b` },
      {
        ...binding,
        generation: Number.MAX_SAFE_INTEGER,
      },
    );
    expect(result.accessTokenBytes).toBe(8192);
    expect(result.envelopeBytes).toBeGreaterThan(8192);
    expect(result.fitsLegacyWindowsProvider).toBe(false);
    expect(result.fitsWindowsDpapiByteBudget).toBe(true);
  });
});
