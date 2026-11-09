import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
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

/** Shell lifetime, not individual summary/list mounts, owns restoration. */
export function SessionOwner({ children }: { children: ReactNode }) {
  const [owner, setOwner] = useState<AuthenticationService>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void authenticationService()
      .then((service) => {
        if (active) setOwner(service);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!owner) return;
    const lifetime = new AbortController();
    const reconcile = () => {
      void owner.restoreSelected(lifetime.signal);
    };
    const visible = () => {
      if (document.visibilityState === "visible") reconcile();
    };
    reconcile();
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
      <Failed value={failed}>{children}</Failed>
    </Owner>
  );
}

export function useSession() {
  const owner = useContext(Owner);
  const failed = useContext(Failed);
  const snapshot = useSyncExternalStore(
    owner?.subscribe ?? noopSubscribe,
    owner?.getSnapshot ?? emptySnapshot,
  );
  return { owner, status: failed ? unavailable : snapshot };
}
