import { invoke } from "@tauri-apps/api/core";
import type { DocumentPort } from "./state-store";
import type { SecretStore } from "./secret-store";
import { validateAccountId, validateSecret } from "./secret-store";
import { storageError, StorageError } from "./errors";
import type { OperationLease, OperationLocks } from "./operation-lock";
import { queuedOperationLocks } from "./operation-lock";
async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw storageError(error);
  }
}
export const nativeDocument: DocumentPort = {
  read: () => call("read_client_state"),
  write: (expected, document, lease) =>
    call("write_client_state", {
      expected,
      document,
      ...(lease?.token ? { leaseId: lease.token } : {}),
    }),
};
export const nativeOperationLocks: OperationLocks = queuedOperationLocks({
  supported: true,
  async run(key, action) {
    const token = await call<string>("acquire_storage_operation", { key });
    let active = true;
    try {
      return await action({
        key,
        token,
        async check() {
          if (!active) throw new StorageError("conflict");
          await call("check_storage_operation", { leaseId: token });
        },
      });
    } finally {
      active = false;
      await call("release_storage_operation", { leaseId: token });
    }
  },
});
async function leaseArgs(id: string, lease?: OperationLease) {
  if (!lease) return {};
  if (lease.key !== `account-${id}`) throw new StorageError("conflict");
  await lease.check();
  return lease.token ? { leaseId: lease.token } : {};
}
export const nativeSecrets: SecretStore = {
  async put(accountId, record, lease) {
    validateAccountId(accountId);
    validateSecret(record);
    await call("put_account_secret", {
      accountId,
      record: Array.from(record),
      ...(await leaseArgs(accountId, lease)),
    });
  },
  async get(accountId, lease) {
    validateAccountId(accountId);
    const bytes = await call<number[] | null>("get_account_secret", {
      accountId,
      ...(await leaseArgs(accountId, lease)),
    });
    if (bytes === null) return null;
    const record = new Uint8Array(bytes);
    validateSecret(record);
    return record;
  },
  async remove(accountId, lease) {
    validateAccountId(accountId);
    await call("remove_account_secret", { accountId, ...(await leaseArgs(accountId, lease)) });
  },
};
