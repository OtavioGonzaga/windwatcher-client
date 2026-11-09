import { describe, expect, it } from "vitest";
import { browserOperationLocks, inMemoryOperationLocks } from "./operation-lock";

describe("owned application operations", () => {
  it("refuses unsupported browser coordination instead of pretending storage events are CAS", async () => {
    const locks = browserOperationLocks("windwatcher-client:/prefix", undefined);
    expect(locks.supported).toBe(false);
    await expect(locks.run("state", async () => {})).rejects.toMatchObject({
      category: "unavailable",
    });
  });
  it("fences released owners, isolates account keys and lets explicit waiters share order", async () => {
    const locks = inMemoryOperationLocks();
    let check: () => Promise<void> = async () => {};
    await locks.run("account-one", async (lease) => {
      check = () => lease.check();
      await expect(locks.run("account-one", async () => {})).rejects.toMatchObject({
        category: "conflict",
      });
      await locks.run("account-two", async (other) => other.check());
    });
    await expect(check()).rejects.toMatchObject({ category: "conflict" });
    const events: number[] = [];
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        locks.run(
          "account-one",
          async () => {
            events.push(i);
          },
          true,
        ),
      ),
    );
    expect(events).toEqual(Array.from({ length: 10 }, (_, i) => i));
  });
});
