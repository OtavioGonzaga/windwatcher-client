import { StorageError } from "./errors";

export interface OperationLease {
  readonly key: string;
  readonly token?: string;
  check(): Promise<void>;
}
export interface OperationLocks {
  readonly supported: boolean;
  run<T>(key: string, action: (lease: OperationLease) => Promise<T>, wait?: boolean): Promise<T>;
}
/** Waiters in one renderer share ownership order; native cross-process contention stays fail-closed. */
export function queuedOperationLocks(port: OperationLocks): OperationLocks {
  const tails = new Map<string, Promise<unknown>>();
  return {
    supported: port.supported,
    run<T>(key: string, action: (lease: OperationLease) => Promise<T>, wait = false): Promise<T> {
      const previous = tails.get(key);
      if (previous && !wait) return Promise.reject(new StorageError("conflict"));
      const next = (previous ?? Promise.resolve())
        .catch(() => {})
        .then(() => port.run(key, action, wait));
      tails.set(key, next);
      const clear = () => {
        if (tails.get(key) === next) tails.delete(key);
      };
      void next.then(clear, clear);
      return next;
    },
  };
}

/** Per-origin/path Web Locks, not BroadcastChannel hints or localStorage CAS. */
export function browserOperationLocks(
  namespace: string,
  manager: LockManager | undefined,
): OperationLocks {
  return {
    supported: manager !== undefined,
    async run(key, action, wait = false) {
      if (!manager) throw new StorageError("unavailable");
      return manager.request(
        `${namespace}:operation:${key}`,
        { mode: "exclusive", ifAvailable: !wait },
        async (lock) => {
          if (!lock) throw new StorageError("conflict");
          let active = true;
          try {
            return await action({
              key,
              async check() {
                if (!active) throw new StorageError("conflict");
              },
            });
          } finally {
            active = false;
          }
        },
      );
    },
  };
}

/** Single-owner fixtures only. Production auth always requires a real cross-context port. */
export function inMemoryOperationLocks(): OperationLocks {
  const owned = new Set<string>();
  return queuedOperationLocks({
    supported: true,
    async run(key, action) {
      if (owned.has(key)) throw new StorageError("conflict");
      owned.add(key);
      let active = true;
      try {
        return await action({
          key,
          async check() {
            if (!active) throw new StorageError("conflict");
          },
        });
      } finally {
        active = false;
        owned.delete(key);
      }
    },
  });
}
