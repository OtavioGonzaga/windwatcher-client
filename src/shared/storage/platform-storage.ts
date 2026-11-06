import { isTauri } from "@tauri-apps/api/core";
import { ProfileRepository } from "../../features/server-profiles/repository";
import { ClientStateStore } from "./state-store";
import { browserDocument, browserNamespace, browserSecrets } from "./browser";
import { browserOperationLocks, queuedOperationLocks } from "./operation-lock";
import { SessionPersistence } from "../../features/authentication/persistence";
let current: Promise<{ profiles: ProfileRepository; sessions: SessionPersistence }> | undefined;
function services() {
  current ??= (async () => {
    if (isTauri()) {
      const { nativeDocument, nativeSecrets, nativeOperationLocks } = await import("./native");
      const state = new ClientStateStore(nativeDocument, nativeOperationLocks);
      return {
        profiles: new ProfileRepository(state, nativeSecrets, nativeOperationLocks),
        sessions: new SessionPersistence(state, nativeSecrets, nativeOperationLocks),
      };
    }
    const namespace = browserNamespace(document.baseURI);
    const locks = queuedOperationLocks(browserOperationLocks(namespace, navigator.locks));
    const state = new ClientStateStore(browserDocument(namespace), locks);
    const secrets = browserSecrets(namespace);
    return {
      profiles: new ProfileRepository(state, secrets, locks),
      sessions: new SessionPersistence(state, secrets, locks),
    };
  })();
  return current;
}
export async function profileRepository(): Promise<ProfileRepository> {
  return (await services()).profiles;
}
export async function sessionPersistence(): Promise<SessionPersistence> {
  return (await services()).sessions;
}
