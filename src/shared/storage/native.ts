import { invoke } from "@tauri-apps/api/core";
import type { DocumentPort } from "./state-store";
import type { SecretStore } from "./secret-store";
import { validateAccountId, validateSecret } from "./secret-store";
import { storageError } from "./errors";
async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw storageError(error);
  }
}
export const nativeDocument: DocumentPort = {
  read: () => call("read_client_state"),
  write: (expected, document) => call("write_client_state", { expected, document }),
};
export const nativeSecrets: SecretStore = {
  async put(accountId, record) {
    validateAccountId(accountId);
    validateSecret(record);
    await call("put_account_secret", { accountId, record: Array.from(record) });
  },
  async get(accountId) {
    validateAccountId(accountId);
    const bytes = await call<number[] | null>("get_account_secret", { accountId });
    if (bytes === null) return null;
    const record = new Uint8Array(bytes);
    validateSecret(record);
    return record;
  },
  async remove(accountId) {
    validateAccountId(accountId);
    await call("remove_account_secret", { accountId });
  },
};
