import { beforeEach, describe, expect, it, vi } from "vitest";

const { persistence, transport } = vi.hoisted(() => ({
  persistence: vi.fn(),
  transport: vi.fn(),
}));
vi.mock("../../shared/storage/platform-storage", () => ({ sessionPersistence: persistence }));
vi.mock("../../shared/platform/http", () => ({ platformHttp: transport }));

describe("platform authentication composition", () => {
  beforeEach(() => {
    vi.resetModules();
    persistence.mockReset();
    transport.mockReset();
  });

  it("shares a single state owner across concurrent consumers", async () => {
    const state = {
      subscribe: vi.fn(),
      subscribeAccountInvalidation: vi.fn(),
      subscribeCommitted: vi.fn(),
    };
    persistence.mockResolvedValue({ state });
    transport.mockResolvedValue(vi.fn());
    const { authenticationService } = await import("./platform-authentication");
    const [first, second] = await Promise.all([authenticationService(), authenticationService()]);
    expect(first).toBe(second);
    expect(persistence).toHaveBeenCalledOnce();
    expect(transport).toHaveBeenCalledOnce();
  });

  it("allows retry after platform initialization fails", async () => {
    const state = {
      subscribe: vi.fn(),
      subscribeAccountInvalidation: vi.fn(),
      subscribeCommitted: vi.fn(),
    };
    persistence.mockRejectedValueOnce(new Error("unavailable")).mockResolvedValue({ state });
    transport.mockResolvedValue(vi.fn());
    const { authenticationService } = await import("./platform-authentication");
    await expect(authenticationService()).rejects.toThrow("unavailable");
    await expect(authenticationService()).resolves.toBeDefined();
    expect(persistence).toHaveBeenCalledTimes(2);
  });
});
