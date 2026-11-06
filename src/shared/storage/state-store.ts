import { decodeState } from "../../features/server-profiles/schema";
import type { ClientStateV1 } from "../../features/server-profiles/schema";
import { StorageError, storageError } from "./errors";

export interface DocumentPort {
  read(): Promise<string | null>;
  write(expected: string | null, document: string): Promise<void>;
  onExternalChange?(listener: () => void): () => void;
}
/** One queue owns read/modify/write AND cross-store deletion sequences. */
export class ClientStateStore {
  private queue: Promise<unknown> = Promise.resolve();
  private stale = false;
  private generation = 0;
  private listeners = new Set<() => void>();
  private dispose: (() => void) | undefined;
  constructor(private readonly port: DocumentPort) {
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
  close() {
    this.dispose?.();
    this.listeners.clear();
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
    mutator: (draft: ClientStateV1) => void | Promise<void>,
    revision?: number,
  ): Promise<ClientStateV1> {
    const operation = this.queue
      .then(async () => {
        if (this.stale) throw new StorageError("conflict");
        const generation = this.generation;
        const before = await this.port.read();
        const draft = decodeState(before);
        if (revision !== undefined && draft.revision !== revision)
          throw new StorageError("conflict");
        await mutator(draft);
        if (this.stale || generation !== this.generation) throw new StorageError("conflict");
        draft.revision++;
        const document = JSON.stringify(draft);
        const checked = decodeState(document);
        await this.port.write(before, document);
        if (generation !== this.generation) throw new StorageError("conflict");
        return checked;
      })
      .catch((error: unknown) => {
        throw storageError(error);
      });
    this.queue = operation.catch(() => {});
    return operation;
  }
}
