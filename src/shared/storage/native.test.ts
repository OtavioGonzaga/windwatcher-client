import { beforeEach, expect, it, vi } from "vitest";
import { nativeDocument, nativeSecrets } from "./native";
const ipc = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: ipc }));
beforeEach(() => {
  ipc.mockReset();
});
it("uses only fixed commands, validates account IDs and never falls back", async () => {
  const id = crypto.randomUUID();
  ipc.mockResolvedValue(null);
  expect(await nativeSecrets.get(id)).toBeNull();
  expect(ipc).toHaveBeenLastCalledWith("get_account_secret", { accountId: id });
  ipc.mockResolvedValue([0, 255]);
  expect(await nativeSecrets.get(id)).toEqual(new Uint8Array([0, 255]));
  await nativeSecrets.put(id, new Uint8Array([1]));
  expect(ipc).toHaveBeenLastCalledWith("put_account_secret", { accountId: id, record: [1] });
  await nativeSecrets.remove(id);
  expect(ipc).toHaveBeenLastCalledWith("remove_account_secret", { accountId: id });
  ipc.mockClear();
  await expect(nativeSecrets.get("../other")).rejects.toMatchObject({ category: "corrupt" });
  expect(ipc).not.toHaveBeenCalled();
  ipc.mockRejectedValue("locked");
  await expect(nativeSecrets.remove(id)).rejects.toMatchObject({ message: "locked" });
  ipc.mockRejectedValue("backend private contents");
  await expect(nativeSecrets.get(id)).rejects.toMatchObject({ message: "unavailable" });
  expect(localStorage.length).toBe(0);
});
it("native metadata uses fixed document IPC and expected snapshot", async () => {
  ipc.mockResolvedValue(null);
  await nativeDocument.read();
  expect(ipc).toHaveBeenLastCalledWith("read_client_state", undefined);
  await nativeDocument.write(null, "next");
  expect(ipc).toHaveBeenLastCalledWith("write_client_state", { expected: null, document: "next" });
});
