import { isTauri } from "@tauri-apps/api/core";
import { nativeDocument, nativeSecrets } from "../../src/shared/storage/native";
import { ClientStateStore } from "../../src/shared/storage/state-store";
import { ProfileRepository } from "../../src/features/server-profiles/repository";
import { storageError } from "../../src/shared/storage/errors";

const report = document.getElementById("result")!;
function status(text: string) {
  report.textContent = text;
  console.info(`STORAGE_SMOKE: ${text}`);
}
// Reproducible synthetic bytes, never real tokens; only IDs/stage metadata persist.
async function synthetic(id: string, phase: number) {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${id}:synthetic:${phase}`)),
  );
}
async function exact(id: string, phase: number) {
  const actual = await nativeSecrets.get(id);
  const expected = await synthetic(id, phase);
  if (
    !actual ||
    actual.length !== expected.length ||
    actual.some((byte, i) => byte !== expected[i])
  )
    throw new Error("mismatch");
}
async function run() {
  if (!isTauri()) throw new Error("native-only");
  const repository = new ProfileRepository(new ClientStateStore(nativeDocument), nativeSecrets);
  let state = await repository.load();
  if (state.serverProfiles.length === 0) {
    state = await repository.saveInspection(
      {
        kind: "supported",
        root: "https://storage-smoke.invalid/",
        metadata: {
          service: "windwatcher",
          api_versions: ["v1"],
          auth_methods: ["password"],
          registration: "closed",
        },
      },
      "Disposable storage smoke",
      false,
    );
    const profile = state.serverProfiles[0]!;
    state = await repository.registerAccount(
      profile.id,
      "019a0000-0000-7000-8000-000000000001",
      "stage-one",
    );
    state = await repository.registerAccount(
      profile.id,
      "019a0000-0000-7000-8000-000000000002",
      "isolation",
    );
    await Promise.all(
      state.accounts.map(async (account) =>
        nativeSecrets.put(account.id, await synthetic(account.id, 1)),
      ),
    );
    status("WRITE PASSED. Close/force-stop and reopen for restart verification.");
  } else {
    const account = state.accounts[0]!;
    const other = state.accounts[1]!;
    await exact(other.id, 1);
    if (account.username === "stage-one") {
      await exact(account.id, 1);
      await nativeSecrets.put(account.id, await synthetic(account.id, 2));
      await repository.updateAccount(account.id, "stage-two");
      status("RESTART READ AND OVERWRITE PASSED. Close/force-stop and reopen again.");
    } else {
      await exact(account.id, 2);
      await nativeSecrets.remove(account.id);
      await nativeSecrets.remove(account.id);
      if ((await nativeSecrets.get(account.id)) !== null) throw new Error("retained");
      await exact(other.id, 1);
      await repository.forgetProfile(state.serverProfiles[0]!.id);
      if ((await nativeSecrets.get(other.id)) !== null) throw new Error("retained");
      status("RESTART OVERWRITE READ, ISOLATION, REMOVE AND CLEANUP PASSED.");
    }
  }
}
void run().catch((error: unknown) => status(`FAILED: ${storageError(error).category}`));
