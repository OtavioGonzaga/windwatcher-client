import { LOCAL_ID, MAX_SECRET_BYTES } from "../../shared/storage/secret-store";
import { decodeSessionGrant, serverUuid } from "./validation";
import type { SessionGrant } from "./validation";
import { encodeSessionEnvelope } from "./envelope";

export const WINDOWS_CREDENTIAL_BLOB_BYTES = 2560;
export const WINDOWS_KEYRING_INPUT_BYTES = 960;

/** Historical keyring-store Base64 -> Windows UTF-16 route, NOT the DPAPI backend. */
export function windowsCredentialBlobBytes(inputBytes: number): number {
  if (!Number.isSafeInteger(inputBytes) || inputBytes < 0 || inputBytes > 16_384)
    throw new Error("Invalid credential length.");
  return 2 * (4 * Math.ceil(inputBytes / 3));
}

export interface EnvelopeMeasurementBinding {
  accountId: string;
  profileId: string;
  userId: string;
  operationId: string;
  generation: number;
}

/**
 * Capacity gate only: encode a fully bound compact candidate, return counts, never tokens.
 * Uses the production envelope encoder; this measurement never writes credentials.
 */
export function measureSessionEnvelope(grant: SessionGrant, binding: EnvelopeMeasurementBinding) {
  const decoded = decodeSessionGrant(grant);
  if (
    !LOCAL_ID.test(binding.accountId) ||
    !LOCAL_ID.test(binding.profileId) ||
    !LOCAL_ID.test(binding.operationId) ||
    !Number.isSafeInteger(binding.generation) ||
    binding.generation < 1
  )
    throw new Error("Invalid measurement binding.");
  serverUuid(binding.userId);
  // Tuple positions are documented in authentication-and-sessions.md.
  const bytes = encodeSessionEnvelope({ ...binding, grant: decoded });
  const result = {
    accessTokenBytes: new TextEncoder().encode(decoded.access_token).byteLength,
    envelopeBytes: bytes.byteLength,
    legacyWindowsBlobBytes: windowsCredentialBlobBytes(bytes.byteLength),
    fitsLegacyWindowsProvider:
      windowsCredentialBlobBytes(bytes.byteLength) <= WINDOWS_CREDENTIAL_BLOB_BYTES,
    fitsWindowsDpapiByteBudget: bytes.byteLength <= MAX_SECRET_BYTES,
  };
  bytes.fill(0); // Best effort only; JavaScript strings/copies cannot be securely erased.
  return result;
}
