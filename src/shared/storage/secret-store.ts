import { StorageError } from "./errors";
export interface SecretStore {
  put(accountId: string, record: Uint8Array): Promise<void>;
  get(accountId: string): Promise<Uint8Array | null>;
  remove(accountId: string): Promise<void>;
}
export const LOCAL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const MAX_SECRET_BYTES = 16_384;
/** Web Crypto only, including browsers without randomUUID on an HTTP origin. */
export function randomLocalId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function validateAccountId(id: string) {
  if (!LOCAL_ID.test(id)) throw new StorageError("corrupt");
}
export function validateSecret(record: Uint8Array) {
  if (!(record instanceof Uint8Array) || record.length < 1) throw new StorageError("corrupt");
  if (record.length > MAX_SECRET_BYTES) throw new StorageError("too-large");
}
