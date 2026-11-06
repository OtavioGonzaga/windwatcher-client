import { isTauri } from "@tauri-apps/api/core";
import { ProfileRepository } from "../../features/server-profiles/repository";
import { ClientStateStore } from "./state-store";
import { browserDocument, browserNamespace, browserSecrets } from "./browser";
let current: Promise<ProfileRepository> | undefined;
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
