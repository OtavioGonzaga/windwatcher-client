import { exit, onBackButtonPress } from "@tauri-apps/api/app";

// Serialize asynchronous registrations and cleanup, including StrictMode remounts.
let lifecycle: Promise<void> = Promise.resolve();
export function subscribeBack(
  handler: (canGoBack: boolean) => void,
  failure: () => void,
): () => void {
  let disposed = false;
  let unregister: (() => Promise<void>) | undefined;
  lifecycle = lifecycle
    .then(async () => {
      if (disposed) return;
      const listener = await onBackButtonPress((payload) => {
        if (!disposed) handler(payload.canGoBack);
      });
      unregister = () => listener.unregister();
      if (disposed) {
        await unregister();
        unregister = undefined;
      }
    })
    .catch(() => {
      if (!disposed) failure();
    });
  return () => {
    disposed = true;
    lifecycle = lifecycle
      .then(async () => {
        await unregister?.();
        unregister = undefined;
      })
      .catch(failure);
  };
}

export async function finishActivity(): Promise<void> {
  await exit(0);
}
