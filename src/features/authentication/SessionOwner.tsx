import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { authenticationService } from "./platform-authentication";
import type { AuthenticationService, SessionStatus } from "./service";

const Owner = createContext<AuthenticationService | undefined>(undefined);
const empty: SessionStatus = Object.freeze({ kind: "signed-out" });
const unavailable: SessionStatus = Object.freeze({
  kind: "error",
  category: "storage-unavailable",
});
const noopSubscribe = () => () => {};
const emptySnapshot = () => empty;
const Failed = createContext(false);
const Retry = createContext<() => void>(() => {});

/** Shell lifetime, not individual summary/list mounts, owns restoration. */
export function SessionOwner({ children }: { children: ReactNode }) {
  const [owner, setOwner] = useState<AuthenticationService>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retryInitialization = useCallback(() => setAttempt((value) => value + 1), []);
  useEffect(() => {
    let active = true;
    void authenticationService()
      .then((service) => {
        if (active) {
          setOwner(service);
          setFailed(false);
        }
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- An explicit retry repeats failed platform initialization.
  }, [attempt]);
  useEffect(() => {
    if (!owner) return undefined;
    const lifetime = new AbortController();
    const reconcile = () => {
      void owner.reconcileSelected(lifetime.signal);
    };
    const visible = () => {
      if (document.visibilityState === "visible") reconcile();
    };
    void owner.restoreSelected(lifetime.signal);
    window.addEventListener("focus", reconcile);
    document.addEventListener("visibilitychange", visible);
    return () => {
      lifetime.abort();
      window.removeEventListener("focus", reconcile);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [owner]);
  return (
    <Owner value={owner}>
      <Failed value={failed}>
        <Retry value={retryInitialization}>{children}</Retry>
      </Failed>
    </Owner>
  );
}

export function useSession() {
  const owner = useContext(Owner);
  const failed = useContext(Failed);
  const retryInitialization = useContext(Retry);
  const snapshot = useSyncExternalStore(
    owner?.subscribe ?? noopSubscribe,
    owner?.getSnapshot ?? emptySnapshot,
  );
  const retry = () => {
    if (owner) void owner.restoreSelected(new AbortController().signal);
    else retryInitialization();
  };
  return { owner, status: failed ? unavailable : snapshot, retry };
}
