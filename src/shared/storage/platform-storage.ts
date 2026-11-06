import { isTauri } from "@tauri-apps/api/core";
import { ProfileRepository } from "../../features/server-profiles/repository";
import { ClientStateStore } from "./state-store";
import { browserDocument, browserNamespace, browserSecrets } from "./browser";
let current: Promise<ProfileRepository> | undefined;
// Profile composition only. PR 8 must add secret-first application coordination
// with a prepared account ID; this factory does not implement session persistence.
export function profileRepository(): Promise<ProfileRepository> {
  current ??= (async () => {
    if (isTauri()) {
      const { nativeDocument, nativeSecrets } = await import("./native");
      return new ProfileRepository(new ClientStateStore(nativeDocument), nativeSecrets);
    }
    const namespace = browserNamespace(document.baseURI);
    return new ProfileRepository(
      new ClientStateStore(browserDocument(namespace)),
      browserSecrets(namespace),
    );
  })();
  return current;
}
