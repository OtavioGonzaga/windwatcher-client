import { StorageError } from "../../shared/storage/errors";
import { LOCAL_ID, MAX_SECRET_BYTES } from "../../shared/storage/secret-store";
import { decodeSessionGrant, serverUuid } from "./validation";
import type { SessionGrant } from "./validation";

export interface SessionEnvelope {
  accountId: string;
  profileId: string;
  userId: string;
  operationId: string;
  generation: number;
  grant: SessionGrant;
}
function check(value: unknown): asserts value {
  if (!value) throw new StorageError("corrupt");
}

/** One versioned UTF-8 tuple, with full profile/user/account/operation binding. */
export function encodeSessionEnvelope(value: SessionEnvelope): Uint8Array {
  const { accountId, profileId, userId, operationId, generation } = value;
  check(LOCAL_ID.test(accountId) && LOCAL_ID.test(profileId) && LOCAL_ID.test(operationId));
  check(Number.isSafeInteger(generation) && generation > 0);
  serverUuid(userId);
  const g = decodeSessionGrant(value.grant);
  const bytes = new Uint8Array(
    new TextEncoder().encode(
      JSON.stringify([
        1,
        accountId,
        profileId,
        userId,
        operationId,
        generation,
        g.session_id,
        g.token_type,
        g.access_token,
        g.refresh_token,
        g.access_token_expires_at,
        g.session_expires_at,
      ]),
    ),
  );
  if (bytes.byteLength > MAX_SECRET_BYTES) throw new StorageError("too-large");
  return bytes;
}

export function decodeSessionEnvelope(
  bytes: Uint8Array,
  binding: { accountId: string; profileId: string; userId: string },
): SessionEnvelope {
  check(bytes.byteLength > 0 && bytes.byteLength <= MAX_SECRET_BYTES);
  try {
    const data: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    check(Array.isArray(data) && data.length === 12 && data[0] === 1);
    const [
      _,
      accountId,
      profileId,
      userId,
      operationId,
      generation,
      sessionId,
      tokenType,
      access,
      refresh,
      accessAt,
      sessionAt,
    ] = data;
    check(
      typeof accountId === "string" && LOCAL_ID.test(accountId) && accountId === binding.accountId,
    );
    check(
      typeof profileId === "string" && LOCAL_ID.test(profileId) && profileId === binding.profileId,
    );
    check(typeof userId === "string" && userId === binding.userId);
    serverUuid(userId);
    check(typeof operationId === "string" && LOCAL_ID.test(operationId));
    check(typeof generation === "number" && Number.isSafeInteger(generation) && generation > 0);
    const grant = decodeSessionGrant({
      access_token: access,
      refresh_token: refresh,
      access_token_expires_at: accessAt,
      session_expires_at: sessionAt,
      session_id: sessionId,
      token_type: tokenType,
    });
    return { accountId, profileId, userId, operationId, generation, grant };
  } catch {
    throw new StorageError("corrupt");
  }
}
