import { beforeEach, describe, expect, it, vi } from "vitest";
import { browserDocument, browserSecrets } from "../../shared/storage/browser";
import { ClientStateStore } from "../../shared/storage/state-store";
import { inMemoryOperationLocks } from "../../shared/storage/operation-lock";
import { StorageError } from "../../shared/storage/errors";
import { ProfileRepository } from "../server-profiles/repository";
import type { AuthIntent, AccountRecord } from "../server-profiles/schema";
import { decodeState } from "../server-profiles/schema";
import { SessionPersistence } from "./persistence";
import { encodeSessionEnvelope, decodeSessionEnvelope } from "./envelope";
import { grant, user } from "../../../tests/fixtures/authentication";

function setup() {
  const port = browserDocument("auth-test");
  const secrets = browserSecrets("auth-test");
  const locks = inMemoryOperationLocks();
  const store = new ClientStateStore(port, locks);
  const profiles = new ProfileRepository(store, secrets, locks);
  const persistence = new SessionPersistence(store, secrets, locks);
  return { port, secrets, locks, store, profiles, persistence };
}
async function profile() {
  const f = setup();
  const state = await f.profiles.saveInspection(
    {
      kind: "supported",
      root: "https://example.test/proxy/",
      metadata: {
        service: "windwatcher",
        api_versions: ["v1"],
        auth_methods: ["password"],
        registration: "open",
      },
    },
    "One",
    false,
  );
  return { ...f, profileId: state.serverProfiles[0]!.id };
}
beforeEach(() => localStorage.clear());

describe("secret-first coordinated session persistence", () => {
  it("prepares one UUID, journals first, verifies the secret, commits that UUID, then selects", async () => {
    const f = await profile();
    const events: string[] = [];
    const originalPut = f.secrets.put.bind(f.secrets);
    const originalGet = f.secrets.get.bind(f.secrets);
    const originalWrite = f.port.write.bind(f.port);
    let alias = "";
    vi.spyOn(f.secrets, "put").mockImplementation(async (id, bytes, lease) => {
      alias = id;
      events.push("put");
      const state = await f.store.load();
      expect(state.accounts).toHaveLength(0);
      expect(state.authOperations[0]?.accountId).toBe(id);
      expect(JSON.stringify(state)).not.toContain(grant.access_token);
      expect(JSON.stringify(state)).not.toContain(grant.refresh_token);
      await originalPut(id, bytes, lease);
    });
    vi.spyOn(f.secrets, "get").mockImplementation(async (...args) => {
      events.push("get");
      return originalGet(...args);
    });
    vi.spyOn(f.port, "write").mockImplementation(async (expected, text, lease) => {
      const state = decodeState(text);
      events.push(
        state.accounts.length ? (state.authOperations.length ? "account" : "clear") : "intent",
      );
      await originalWrite(expected, text, lease);
    });
    const saved = await f.persistence.saveLogin(f.profileId, user, grant);
    expect(saved.id).toBe(alias);
    expect(events).toEqual(["intent", "put", "get", "account", "clear"]);
    const restarted = setup();
    const state = await restarted.store.load();
    expect(state.selectedAccountId).toBe(alias);
    expect(state.authOperations).toEqual([]);
    expect(saved.serverUserId).toBe(user.id);
    await restarted.locks.run(`account-${alias}`, async (lease) => {
      const actual = await restarted.persistence.read(saved, lease);
      expect(actual?.generation).toBe(1);
      expect(actual?.accountId).toBe(alias);
      expect(actual?.grant).toEqual(grant);
    });
  });
  it.each(["put", "readback", "metadata"] as const)(
    "never announces a saved account after %s failure",
    async (stage) => {
      const f = await profile();
      if (stage === "put")
        vi.spyOn(f.secrets, "put").mockRejectedValueOnce(new StorageError("locked"));
      if (stage === "readback")
        vi.spyOn(f.secrets, "get").mockRejectedValueOnce(new StorageError("locked"));
      if (stage === "metadata") {
        const write = f.port.write.bind(f.port);
        vi.spyOn(f.port, "write").mockImplementation(async (expected, text, lease) => {
          if (decodeState(text).accounts.length) throw new StorageError("quota");
          await write(expected, text, lease);
        });
      }
      await expect(f.persistence.saveLogin(f.profileId, user, grant)).rejects.toBeInstanceOf(
        StorageError,
      );
      const state = await f.store.load();
      expect(state.accounts).toEqual([]);
      expect(state.selectedAccountId).toBeNull();
      expect(state.authOperations).toEqual([]);
      expect(Object.keys(localStorage).filter((key) => key.includes(":secret:"))).toEqual([]);
    },
  );
  it("keeps a bounded durable intent when orphan compensation fails, then cleans only its alias on restart", async () => {
    const f = await profile();
    vi.spyOn(f.secrets, "get").mockRejectedValueOnce(new StorageError("locked"));
    vi.spyOn(f.secrets, "remove").mockRejectedValueOnce(new StorageError("locked"));
    await expect(f.persistence.saveLogin(f.profileId, user, grant)).rejects.toMatchObject({
      category: "locked",
    });
    const state = await f.store.load();
    expect(state.accounts).toHaveLength(0);
    expect(state.authOperations).toHaveLength(1);
    const unrelated = crypto.randomUUID();
    await f.secrets.put(unrelated, new Uint8Array([42]));
    const restarted = setup();
    await restarted.persistence.reconcileAll();
    expect((await restarted.store.load()).authOperations).toEqual([]);
    expect(await restarted.secrets.get(state.authOperations[0]!.accountId)).toBeNull();
    expect(await restarted.secrets.get(unrelated)).toEqual(new Uint8Array([42]));
  });
  it("reuses the same local account on re-login and advances its generation", async () => {
    const f = await profile();
    const first = await f.persistence.saveLogin(f.profileId, user, grant);
    const second = await f.persistence.saveLogin(
      f.profileId,
      { ...user, username: "renamed" },
      { ...grant, session_id: "019a0000-0000-7000-8000-000000000003" },
    );
    expect(second.id).toBe(first.id);
    expect(second.session?.generation).toBe(2);
    expect(second.username).toBe("renamed");
    expect((await f.store.load()).accounts).toHaveLength(1);
  });
  it("does not blindly delete an established credential after failed replacement", async () => {
    const f = await profile();
    const first = await f.persistence.saveLogin(f.profileId, user, grant);
    const original = await f.secrets.get(first.id);
    const remove = vi.spyOn(f.secrets, "remove");
    vi.spyOn(f.secrets, "put").mockRejectedValueOnce(new StorageError("locked"));
    await expect(f.persistence.saveLogin(f.profileId, user, grant)).rejects.toMatchObject({
      category: "locked",
    });
    expect(remove).not.toHaveBeenCalled();
    expect(await f.secrets.get(first.id)).toEqual(original);
    expect((await f.store.load()).authOperations[0]?.phase).toBe("recovery-required");
  });
  it("recognizes committed metadata when journal clearing fails", async () => {
    const f = await profile();
    const write = f.port.write.bind(f.port);
    vi.spyOn(f.port, "write").mockImplementation(async (expected, text, lease) => {
      const state = decodeState(text);
      if (state.accounts.length && state.authOperations.length === 0)
        throw new StorageError("quota");
      await write(expected, text, lease);
    });
    await expect(f.persistence.saveLogin(f.profileId, user, grant)).rejects.toMatchObject({
      category: "quota",
    });
    const before = await f.store.load();
    expect(before.accounts).toHaveLength(1);
    expect(before.authOperations[0]?.phase).toBe("prepared");
    const restarted = setup();
    await restarted.persistence.reconcileAll();
    expect((await restarted.store.load()).authOperations).toEqual([]);
    expect((await restarted.store.load()).selectedAccountId).toBe(before.accounts[0]!.id);
  });
  it("aborted login does not select an account after secret I/O finishes", async () => {
    const f = await profile();
    const controller = new AbortController();
    const put = f.secrets.put.bind(f.secrets);
    vi.spyOn(f.secrets, "put").mockImplementation(async (...args) => {
      await put(...args);
      controller.abort();
    });
    await expect(
      f.persistence.saveLogin(f.profileId, user, grant, controller.signal),
    ).rejects.toMatchObject({ category: "cancelled" });
    expect((await f.store.load()).selectedAccountId).toBeNull();
    expect((await f.store.load()).accounts).toEqual([]);
  });
  it("serializes forget/remove against the same account lease", async () => {
    const f = await profile();
    const saved = await f.persistence.saveLogin(f.profileId, user, grant);
    await f.locks.run(`account-${saved.id}`, async () => {
      await expect(f.profiles.removeAccount(saved.id)).rejects.toMatchObject({
        category: "conflict",
      });
      await f.store.load();
      await expect(f.profiles.forgetProfile(f.profileId)).rejects.toMatchObject({
        category: "conflict",
      });
    });
    expect((await f.store.load()).accounts).toHaveLength(1);
    expect(await f.secrets.get(saved.id)).not.toBeNull();
  });
});

describe("persistent synthetic crash snapshots", () => {
  async function snapshot(
    kind: AuthIntent["kind"],
    phase: AuthIntent["phase"],
    stored: "old" | "new" | "missing",
    committed = false,
  ) {
    const f = await profile();
    const id = crypto.randomUUID();
    const oldOp = crypto.randomUUID();
    const opId = crypto.randomUUID();
    const account: AccountRecord = {
      id,
      serverProfileId: f.profileId,
      serverUserId: user.id,
      username: user.username,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      session: {
        generation: committed ? 2 : 1,
        sessionId: grant.session_id,
        operationId: committed ? opId : oldOp,
      },
    };
    const intent: AuthIntent = {
      accountId: id,
      profileId: f.profileId,
      userId: user.id,
      sessionId: grant.session_id,
      operationId: opId,
      kind,
      phase,
      expectedGeneration: kind === "create" ? 0 : 1,
      targetGeneration: 2,
      startedAt: new Date().toISOString(),
    };
    await f.store.update((draft) => {
      if (kind !== "create" || committed) draft.accounts.push(account);
      draft.authOperations.push(intent);
      if (committed) draft.selectedAccountId = id;
    });
    if (stored !== "missing")
      await f.secrets.put(
        id,
        encodeSessionEnvelope({
          accountId: id,
          profileId: f.profileId,
          userId: user.id,
          operationId: stored === "old" ? oldOp : opId,
          generation: stored === "old" ? 1 : 2,
          grant,
        }),
      );
    return { ...f, id, intent };
  }
  it.each(["missing", "new"] as const)(
    "cleans an uncommitted new-account orphan (%s) after process death",
    async (stored) => {
      const f = await snapshot("create", "prepared", stored);
      const restarted = setup();
      await restarted.persistence.reconcileAll();
      expect((await restarted.store.load()).accounts).toEqual([]);
      expect((await restarted.store.load()).authOperations).toEqual([]);
      expect(await restarted.secrets.get(f.id)).toBeNull();
    },
  );
  it.each([
    ["refresh", "prepared", "old", false, false],
    ["refresh", "sent", "old", false, true],
    ["refresh", "sent", "missing", false, true],
    ["refresh", "sent", "new", false, false],
    ["refresh", "sent", "new", true, false],
    ["replace", "prepared", "old", false, true],
    ["replace", "prepared", "new", false, false],
    ["create", "prepared", "new", true, false],
    ["refresh", "recovery-required", "new", false, true],
  ] as const)(
    "recovers %s/%s/%s/committed=%s without replaying refresh",
    async (kind, phase, stored, committed, blocked) => {
      const f = await snapshot(kind, phase, stored, committed);
      const restarted = setup();
      await restarted.persistence.reconcileAll();
      const after = await restarted.store.load();
      expect(after.accounts).toHaveLength(1);
      expect(after.authOperations.some((op) => op.phase === "recovery-required")).toBe(blocked);
      if (!blocked && stored === "new") expect(after.accounts[0]?.session?.generation).toBe(2);
      if (stored === "old") expect(after.accounts[0]?.session?.generation).toBe(1);
      expect(await restarted.secrets.get(f.id)).toEqual(await f.secrets.get(f.id));
    },
  );
  it("fails closed on old intents rather than deleting registered credentials", async () => {
    const f = await snapshot("refresh", "sent", "new");
    await f.store.update((draft) => {
      draft.authOperations[0]!.startedAt = "2020-01-01T00:00:00.000Z";
    });
    await setup().persistence.reconcileAll();
    expect((await setup().store.load()).authOperations[0]?.phase).toBe("recovery-required");
    expect(await f.secrets.get(f.id)).not.toBeNull();
  });
  it("does not persist a mismatched envelope under another account alias", async () => {
    const f = await snapshot("refresh", "sent", "old");
    const actual = decodeSessionEnvelope((await f.secrets.get(f.id))!, {
      accountId: f.id,
      profileId: f.profileId,
      userId: user.id,
    });
    await f.locks.run(`account-${f.id}`, async (lease) => {
      await expect(
        f.persistence.persist(
          f.intent,
          {
            ...actual,
            accountId: crypto.randomUUID(),
            generation: 2,
            operationId: f.intent.operationId,
          },
          lease,
        ),
      ).rejects.toMatchObject({ category: "conflict" });
    });
  });
});
