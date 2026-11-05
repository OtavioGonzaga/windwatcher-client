import { describe, expect, it, vi } from "vitest";
const native = vi.hoisted(() => ({ register: vi.fn(), exit: vi.fn() }));
vi.mock("@tauri-apps/api/app", () => ({ onBackButtonPress: native.register, exit: native.exit }));
import { finishActivity, subscribeBack } from "./android-back";

describe("native Back listener lifecycle", () => {
  it("cleans pending registration before registering a replacement", async () => {
    let complete!: (listener: { unregister: () => Promise<void> }) => void;
    const unregister = vi.fn(async () => {});
    native.register.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const handler = vi.fn();
    const failure = vi.fn();
    const first = subscribeBack(handler, failure);
    await Promise.resolve();
    first();
    const second = subscribeBack(handler, failure);
    native.register.mockResolvedValue({ unregister });
    complete({ unregister });
    await vi.waitFor(() => expect(native.register).toHaveBeenCalledTimes(2));
    expect(unregister).toHaveBeenCalledTimes(1);
    second();
    await vi.waitFor(() => expect(unregister).toHaveBeenCalledTimes(2));
    expect(failure).not.toHaveBeenCalled();
  });
  it("reports registration failures and finishes without a process plugin", async () => {
    native.register.mockRejectedValueOnce(new Error("denied"));
    const failure = vi.fn();
    const dispose = subscribeBack(vi.fn(), failure);
    await vi.waitFor(() => expect(failure).toHaveBeenCalledOnce());
    dispose();
    await finishActivity();
    expect(native.exit).toHaveBeenCalledWith(0);
  });
});
