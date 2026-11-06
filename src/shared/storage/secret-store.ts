import { StorageError } from "./errors";
export interface SecretStore {
  put(accountId: string, record: Uint8Array): Promise<void>;
  get(accountId: string): Promise<Uint8Array | null>;
  remove(accountId: string): Promise<void>;
}
export const LOCAL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function validateAccountId(id: string) {
  if (!LOCAL_ID.test(id)) throw new StorageError("corrupt");
}
export function validateSecret(record: Uint8Array) {
  if (!(record instanceof Uint8Array) || record.length < 1 || record.length > 16_384)
    throw new StorageError("corrupt");
}
