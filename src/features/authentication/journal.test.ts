import { describe, expect, it } from "vitest";
import { decodeState, emptyState } from "../server-profiles/schema";
import { StorageError } from "../../shared/storage/errors";
import { encodeSessionEnvelope, decodeSessionEnvelope } from "./envelope";
import { grant, user } from "../../../tests/fixtures/authentication";

const profileId = "550e8400-e29b-41d4-a716-446655440001";
const accountId = "550e8400-e29b-41d4-a716-446655440002";
const operationId = "550e8400-e29b-41d4-a716-446655440003";
const at = "2026-11-06T12:00:00.000Z";
const v1 = {
  schemaVersion: 1,
  revision: 7,
  serverProfiles: [
    {
      id: profileId,
      canonicalUrl: "https://example.test/",
      label: "One",
      discovery: {
        kind: "supported",
        inspectedAt: at,
        apiVersions: ["v1"],
        authMethods: ["password"],
        registration: "open",
      },
      createdAt: at,
      updatedAt: at,
    },
  ],
  accounts: [
    {
      id: accountId,
      serverProfileId: profileId,
      serverUserId: user.id,
      username: user.username,
      createdAt: at,
      updatedAt: at,
    },
  ],
  selectedAccountId: accountId,
};
const intent = {
  accountId,
  profileId,
  userId: user.id,
  sessionId: grant.session_id,
  operationId,
  kind: "replace",
  phase: "prepared",
  expectedGeneration: 0,
  targetGeneration: 1,
  startedAt: at,
};

describe("validated nonsecret V1 to V2 migration", () => {
  it("preserves every identity, revision, selection and profile without creating a session", () => {
    const text = JSON.stringify(v1);
    const result = decodeState(text);
    expect(result).toEqual({ ...v1, schemaVersion: 2, authOperations: [] });
    expect(result.accounts[0]?.session).toBeUndefined();
    expect(JSON.stringify(v1)).toBe(text);
    expect(decodeState(null)).toEqual(emptyState());
  });
  it("does not smuggle V2 fields into a V1 document or reset unsupported versions", () => {
    expect(() => decodeState(JSON.stringify({ ...v1, authOperations: [] }))).toThrow(StorageError);
    expect(() => decodeState(JSON.stringify({ ...v1, schemaVersion: 3 }))).toThrow(
      expect.objectContaining({ category: "version-unsupported" }),
    );
  });
  it("round trips a bounded nonsecret operation without credentials", () => {
    const state = { ...v1, schemaVersion: 2, authOperations: [intent] };
    expect(decodeState(JSON.stringify(state))).toEqual(state);
    expect(JSON.stringify(state)).not.toContain(grant.access_token);
    expect(JSON.stringify(state)).not.toContain(grant.refresh_token);
  });
  it.each([
    { ...intent, refreshToken: "must not be stored" },
    { ...intent, fingerprint: "must not be stored" },
    { ...intent, profileId: crypto.randomUUID() },
    { ...intent, userId: "alice" },
    { ...intent, accountId: profileId },
    { ...intent, operationId: "../token" },
    { ...intent, targetGeneration: 0 },
    { ...intent, targetGeneration: Number.MAX_SAFE_INTEGER + 1 },
    { ...intent, expectedGeneration: -1 },
    { ...intent, expectedGeneration: 1 },
    { ...intent, kind: "logout" },
    { ...intent, phase: "sent" },
    { ...intent, startedAt: "2026-02-30T12:00:00.000Z" },
  ])("rejects malformed, unbound and secret-bearing journal entries (%#)", (entry) => {
    expect(() =>
      decodeState(JSON.stringify({ ...v1, schemaVersion: 2, authOperations: [entry] })),
    ).toThrow(StorageError);
  });
  it("rejects duplicate reservations and oversized journals", () => {
    for (const authOperations of [[intent, intent], Array.from({ length: 501 }, () => intent)])
      expect(() =>
        decodeState(JSON.stringify({ ...v1, schemaVersion: 2, authOperations })),
      ).toThrow(StorageError);
  });
});

describe("single credential envelope", () => {
  const envelope = { accountId, profileId, userId: user.id, operationId, generation: 1, grant };
  const binding = { accountId, profileId, userId: user.id };
  it("stores one complete versioned tuple with identity and operation binding", () => {
    const bytes = encodeSessionEnvelope(envelope);
    expect(decodeSessionEnvelope(bytes, binding)).toEqual(envelope);
    expect(bytes.byteLength).toBeLessThan(16384);
    expect(() =>
      decodeSessionEnvelope(bytes, { ...binding, accountId: crypto.randomUUID() }),
    ).toThrow(StorageError);
    expect(() =>
      decodeSessionEnvelope(bytes, { ...binding, profileId: crypto.randomUUID() }),
    ).toThrow(StorageError);
    expect(() =>
      decodeSessionEnvelope(bytes, { ...binding, userId: "019a0000-0000-7000-8000-000000000004" }),
    ).toThrow(StorageError);
  });
  it.each([
    new Uint8Array(),
    new Uint8Array([0xff]),
    new Uint8Array(16385),
    new TextEncoder().encode("[]"),
  ])("rejects corrupt/unbounded records (%#)", (bytes) => {
    expect(() => decodeSessionEnvelope(bytes, binding)).toThrow(StorageError);
  });
  it("rejects unknown versions, trailing fields and malformed grants", () => {
    const original: unknown = JSON.parse(new TextDecoder().decode(encodeSessionEnvelope(envelope)));
    if (!Array.isArray(original)) throw new Error("Expected synthetic tuple.");
    for (const data of [
      [2, ...original.slice(1)],
      [...original, "extra"],
      [...original.slice(0, 9), "malformed", ...original.slice(10)],
    ])
      expect(() =>
        decodeSessionEnvelope(new TextEncoder().encode(JSON.stringify(data)), binding),
      ).toThrow(StorageError);
  });
});
