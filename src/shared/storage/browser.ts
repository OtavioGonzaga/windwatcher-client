import type { DocumentPort } from "./state-store";
import type { SecretStore } from "./secret-store";
import { validateAccountId, validateSecret } from "./secret-store";
import { storageError, StorageError } from "./errors";
import type { OperationLease } from "./operation-lock";

async function checkLease(key: string, lease?: OperationLease) {
  if (lease && lease.key !== key) throw new StorageError("conflict");
  await lease?.check();
}

export function browserNamespace(base: string) {
  return `windwatcher-client:${encodeURIComponent(new URL(".", base).pathname)}:v1`;
}
export function browserDocument(
  namespace: string,
  storage: () => Storage = () => localStorage,
  events: Window = window,
): DocumentPort {
  const key = `${namespace}:state`;
  return {
    async read() {
      try {
        return storage().getItem(key);
      } catch (error) {
        throw storageError(error);
      }
    },
    async write(expected, document, lease) {
      await checkLease("state", lease);
      try {
        if (storage().getItem(key) !== expected) throw new StorageError("conflict");
        storage().setItem(key, document);
      } catch (error) {
        throw storageError(error);
      }
    },
    onExternalChange(listener) {
      const handler = (event: StorageEvent) => {
        if (event.key !== key && event.key !== null) return;
        try {
          if (event.storageArea && event.storageArea !== storage()) return;
        } catch {
          /* A policy change can revoke access; invalidate rather than throw from the event handler. */
        }
        listener();
      };
      events.addEventListener("storage", handler);
      return () => events.removeEventListener("storage", handler);
    },
  };
}
/** Roadmap-approved web risk: same-origin JS can read these unencrypted records. */
export function browserSecrets(
  namespace: string,
  storage: () => Storage = () => localStorage,
): SecretStore {
  const key = (id: string) => {
    validateAccountId(id);
    return `${namespace}:secret:${id}`;
  };
  return {
    async put(id, record, lease) {
      await checkLease(`account-${id}`, lease);
      validateSecret(record);
      try {
        storage().setItem(key(id), JSON.stringify({ schemaVersion: 1, bytes: Array.from(record) }));
      } catch (error) {
        throw storageError(error);
      }
    },
    async get(id, lease) {
      await checkLease(`account-${id}`, lease);
      try {
        const raw = storage().getItem(key(id));
        if (raw === null) return null;
        if (raw.length > 100_000) throw new StorageError("corrupt");
        let data: unknown;
        try {
          data = JSON.parse(raw);
        } catch {
          throw new StorageError("corrupt");
        }
        if (!data || typeof data !== "object" || !("schemaVersion" in data))
          throw new StorageError("corrupt");
        if (data.schemaVersion !== 1) throw new StorageError("version-unsupported");
        if (
          Object.keys(data).length !== 2 ||
          !("bytes" in data) ||
          !Array.isArray(data.bytes) ||
          !data.bytes.every(
            (byte: unknown) =>
              typeof byte === "number" && Number.isInteger(byte) && byte >= 0 && byte <= 255,
          )
        )
          throw new StorageError("corrupt");
        const record = new Uint8Array(data.bytes);
        validateSecret(record);
        return record;
      } catch (error) {
        throw storageError(error);
      }
    },
    async remove(id, lease) {
      await checkLease(`account-${id}`, lease);
      try {
        storage().removeItem(key(id));
      } catch (error) {
        throw storageError(error);
      }
    },
  };
}
