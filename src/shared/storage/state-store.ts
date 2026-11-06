import { decodeState } from "../../features/server-profiles/schema";
import type { ClientStateV2 } from "../../features/server-profiles/schema";
import type { OperationLease, OperationLocks } from "./operation-lock";
import { StorageError, storageError } from "./errors";

export interface DocumentPort {
  read(): Promise<string | null>;
  write(expected: string | null, document: string, lease?: OperationLease): Promise<void>;
  onExternalChange?(listener: () => void): () => void;
}
/** One queue owns read/modify/write AND cross-store deletion sequences. */
export class ClientStateStore {
  private queue: Promise<unknown> = Promise.resolve();
  private stale = false;
  private generation = 0;
  private listeners = new Set<() => void>();
  private committed = new Set<() => void>();
  private accountInvalidations = new Set<(accountId: string) => void>();
  private dispose: (() => void) | undefined;
  constructor(
    private readonly port: DocumentPort,
    private readonly locks?: OperationLocks,
  ) {
    this.dispose = port.onExternalChange?.(() => {
      this.stale = true;
      this.generation++;
      for (const listener of this.listeners) listener();
    });
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  subscribeCommitted(listener: () => void) { this.committed.add(listener); return () => { this.committed.delete(listener); }; }
  subscribeAccountInvalidation(listener: (accountId: string) => void) { this.accountInvalidations.add(listener); return () => { this.accountInvalidations.delete(listener); }; }
  invalidateAccount(accountId: string) { for (const listener of this.accountInvalidations) listener(accountId); }
  close() {
    this.dispose?.();
    this.listeners.clear();
    this.committed.clear(); this.accountInvalidations.clear();
  }
  async load() {
    await this.queue;
    const generation = this.generation;
    const state = decodeState(await this.port.read());
    if (generation !== this.generation) throw new StorageError("conflict");
    this.stale = false;
    return state;
  }
  update(
    mutator: (draft: ClientStateV2, lease?: OperationLease) => void | Promise<void>,
    revision?: number,
  ): Promise<ClientStateV2> {
    if (this.locks && !this.locks.supported) return Promise.reject(new StorageError("unavailable"));
    const change = async (lease?: OperationLease) => {
      await lease?.check();
      if (this.stale) throw new StorageError("conflict");
      const generation = this.generation;
      const before = await this.port.read();
      const draft = decodeState(before);
      if (revision !== undefined && draft.revision !== revision) throw new StorageError("conflict");
      await mutator(draft, lease);
      await lease?.check();
      if (this.stale || generation !== this.generation) throw new StorageError("conflict");
      draft.revision++;
      const document = JSON.stringify(draft);
      const checked = decodeState(document);
      await this.port.write(before, document, lease);
      if ((await this.port.read()) !== document) throw new StorageError("conflict");
      if (generation !== this.generation) throw new StorageError("conflict");
      for (const listener of this.committed) listener();
      return checked;
    };
    const operation = this.queue
      .then(() => (this.locks?.supported ? this.locks.run("state", change) : change()))
      .catch((error: unknown) => {
        throw storageError(error);
      });
    this.queue = operation.catch(() => {});
    return operation;
  }
}
