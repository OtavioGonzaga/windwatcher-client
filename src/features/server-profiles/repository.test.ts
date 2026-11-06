import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileRepository } from "./repository";
import { decodeState, emptyState } from "./schema";
import type { ClientStateV1 } from "./schema";
import { ClientStateStore } from "../../shared/storage/state-store";
import { browserDocument, browserNamespace, browserSecrets } from "../../shared/storage/browser";
import { StorageError } from "../../shared/storage/errors";
import { LOCAL_ID, randomLocalId } from "../../shared/storage/secret-store";
import type { DiscoveryResult } from "../server-discovery/discover-server";

const inspection = (root = "https://example.test/"): DiscoveryResult => ({
  kind: "supported",
  root,
  metadata: {
    service: "windwatcher",
    api_versions: ["v1", "future"],
    auth_methods: ["password"],
    registration: "closed",
  },
});
const user1 = "019a0000-0000-7000-8000-000000000001";
const user2 = "019a0000-0000-7000-8000-000000000002";
function fixture() {
  const port = browserDocument("test");
  const store = new ClientStateStore(port);
  const secrets = browserSecrets("test");
  return { port, store, secrets, repository: new ProfileRepository(store, secrets) };
}
beforeEach(() => localStorage.clear());

describe("profile/account repository", () => {
  it("uses secure getRandomValues when randomUUID is unavailable", () => {
    const secure = crypto.getRandomValues.bind(crypto);
    vi.stubGlobal("crypto", { getRandomValues: secure });
    try {
      expect(randomLocalId()).toMatch(LOCAL_ID);
      expect(randomLocalId()).not.toBe(randomLocalId());
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("does not initialize storage on a missing read; saves and reloads N distinct roots", async () => {
    const { repository } = fixture();
    expect(await repository.load()).toEqual(emptyState());
    expect(localStorage.length).toBe(0);
    const roots = [
      "https://example.test/",
      "http://example.test/",
      "https://example.test:8443/",
      "https://example.test/proxy/",
      "http://127.0.0.1/",
      "http://[::1]/",
    ];
    await Promise.all(roots.map((root) => repository.saveInspection(inspection(root), "", false)));
    const state = await fixture().repository.load();
    expect(state.serverProfiles.map((p) => p.canonicalUrl)).toEqual(roots);
    expect(new Set(state.serverProfiles.map((p) => p.id)).size).toBe(roots.length);
    expect(state.revision).toBe(roots.length);
    expect(state.accounts).toEqual([]);
    expect(state.selectedAccountId).toBeNull();
  });
  it("canonicalizes duplicate addresses and explicitly updates snapshots without changing ID", async () => {
    const { repository } = fixture();
    const first = await repository.saveInspection(
      inspection("https://EXAMPLE.test:443"),
      "One",
      false,
    );
    await expect(repository.saveInspection(inspection(), "Two", false)).rejects.toMatchObject({
      category: "duplicate",
    });
    const updated = await repository.saveInspection(inspection(), "Two", false, true);
    expect(updated.serverProfiles).toHaveLength(1);
    expect(updated.serverProfiles[0]?.id).toBe(first.serverProfiles[0]?.id);
    expect(updated.serverProfiles[0]?.label).toBe("Two");
    const renamed = await repository.renameProfile(updated.serverProfiles[0]!.id, "New");
    expect(renamed.serverProfiles[0]?.canonicalUrl).toBe("https://example.test/");
  });
  it.each<DiscoveryResult>([
    { kind: "wrong-service", root: "https://example.test/" },
    { kind: "unsupported-api", root: "https://example.test/", advertised: ["v2"] },
    { kind: "unsupported-auth", root: "https://example.test/", advertised: [] },
    { kind: "legacy", root: "https://example.test/", recognized: false },
  ])("rejects unsavable inspection $kind", (result) => {
    expect(() => fixture().repository.saveInspection(result, "Name", true)).toThrow(StorageError);
    expect(localStorage.length).toBe(0);
  });
  it("requires acknowledgment for corroborated legacy and persists only an unverified snapshot", async () => {
    const { repository } = fixture();
    const legacy: DiscoveryResult = {
      kind: "legacy",
      recognized: true,
      root: "https://example.test/",
    };
    expect(() => repository.saveInspection(legacy, "", false)).toThrow(StorageError);
    const saved = await repository.saveInspection(legacy, "", true);
    expect(saved.serverProfiles[0]?.discovery).toEqual({
      kind: "legacy",
      inspectedAt: expect.any(String),
      legacyAcknowledgedAt: expect.any(String),
    });
  });
  it("isolates server-user IDs rather than usernames, updates display data and selection", async () => {
    const { repository } = fixture();
    await repository.saveInspection(inspection(), "One", false);
    const profiles = (
      await repository.saveInspection(inspection("https://other.test/"), "Two", false)
    ).serverProfiles;
    await repository.registerAccount(profiles[0]!.id, user1, "alice");
    await repository.registerAccount(profiles[0]!.id, user2, "alice");
    let state = await repository.registerAccount(profiles[1]!.id, user1, "alice");
    expect(state.accounts).toHaveLength(3);
    await expect(
      repository.registerAccount(profiles[0]!.id, user1, "new-name"),
    ).rejects.toMatchObject({ category: "duplicate" });
    const account = state.accounts[0]!;
    state = await repository.updateAccount(account.id, "renamed");
    expect(state.accounts[0]?.serverUserId).toBe(user1);
    await repository.selectAccount(account.id);
    expect((await fixture().repository.load()).selectedAccountId).toBe(account.id);
    state = await repository.removeAccount(account.id);
    expect(state.selectedAccountId).toBeNull();
    expect(state.accounts).toHaveLength(2);
    await expect(repository.selectAccount(account.id)).rejects.toMatchObject({
      category: "corrupt",
    });
  });
  it("rejects invented/invalid remote IDs and absent profile foreign keys", async () => {
    const { repository } = fixture();
    const state = await repository.saveInspection(inspection(), "One", false);
    await expect(
      repository.registerAccount(state.serverProfiles[0]!.id, "alice", "alice"),
    ).rejects.toMatchObject({ category: "corrupt" });
    await expect(
      repository.registerAccount(crypto.randomUUID(), user1, "alice"),
    ).rejects.toMatchObject({ category: "corrupt" });
  });
  it("preserves metadata after partial secret deletion, retries idempotently and leaves unrelated records", async () => {
    const { repository, secrets } = fixture();
    const first = (await repository.saveInspection(inspection(), "One", false)).serverProfiles[0]!;
    const second = (
      await repository.saveInspection(inspection("https://other.test/"), "Two", false)
    ).serverProfiles[1]!;
    await repository.registerAccount(first.id, user1, "alice");
    await repository.registerAccount(first.id, user2, "bob");
    const state = await repository.registerAccount(second.id, user1, "alice");
    await Promise.all(
      state.accounts.map((account) => secrets.put(account.id, new Uint8Array([1, 2, 3]))),
    );
    const remove = vi.spyOn(secrets, "remove");
    remove
      .mockImplementationOnce(async (id) => browserSecrets("test").remove(id))
      .mockRejectedValueOnce(new StorageError("locked"));
    await expect(repository.forgetProfile(first.id)).rejects.toMatchObject({ category: "locked" });
    expect((await repository.load()).accounts).toHaveLength(3);
    expect(await secrets.get(state.accounts[0]!.id)).toBeNull();
    remove.mockRestore();
    const after = await repository.forgetProfile(first.id);
    expect(after.accounts).toEqual([state.accounts[2]]);
    expect(after.serverProfiles).toEqual([second]);
    expect(await secrets.get(state.accounts[2]!.id)).toEqual(new Uint8Array([1, 2, 3]));
  });
  it("keeps metadata after a post-secret metadata-write failure; retry can complete", async () => {
    const { repository, port, secrets } = fixture();
    const profile = (await repository.saveInspection(inspection(), "One", false))
      .serverProfiles[0]!;
    const account = (await repository.registerAccount(profile.id, user1, "alice")).accounts[0]!;
    await secrets.put(account.id, new Uint8Array([42]));
    const fail = vi.spyOn(port, "write").mockRejectedValueOnce(new StorageError("quota"));
    await expect(repository.removeAccount(account.id)).rejects.toMatchObject({ category: "quota" });
    expect((await repository.load()).accounts).toHaveLength(1);
    expect(await secrets.get(account.id)).toBeNull();
    fail.mockRestore();
    expect((await repository.removeAccount(account.id)).accounts).toHaveLength(0);
  });
  it("serializes simultaneous operations and rejects stale revisions", async () => {
    const { repository } = fixture();
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        repository.saveInspection(inspection(`https://s${i}.test/`), `S${i}`, false),
      ),
    );
    const state = await repository.load();
    expect(state.serverProfiles).toHaveLength(10);
    expect(state.revision).toBe(10);
    await expect(
      repository.renameProfile(state.serverProfiles[0]!.id, "Other", 0),
    ).rejects.toMatchObject({ category: "conflict" });
  });
  it("observed external changes require an explicit reload", async () => {
    const { repository, store } = fixture();
    const listener = vi.fn();
    store.subscribe(listener);
    window.dispatchEvent(new StorageEvent("storage", { key: "test:state" }));
    expect(listener).toHaveBeenCalledOnce();
    await expect(repository.saveInspection(inspection(), "One", false)).rejects.toMatchObject({
      category: "conflict",
    });
    await repository.load();
    await repository.saveInspection(inspection(), "One", false);
    store.close();
  });
  it.each(["", "a\nb", "a\u202eb", "x".repeat(81)])(
    "rejects invalid renamed labels %j",
    async (label) => {
      const { repository } = fixture();
      const profile = (await repository.saveInspection(inspection(), "One", false))
        .serverProfiles[0]!;
      expect(() => repository.renameProfile(profile.id, label)).toThrow(StorageError);
    },
  );
  it("collision-checks secure local UUIDs", async () => {
    const { repository } = fixture();
    const id = "550e8400-e29b-41d4-a716-446655440000";
    const random = vi.spyOn(crypto, "randomUUID").mockReturnValue(id);
    await repository.saveInspection(inspection(), "One", false);
    await expect(
      repository.saveInspection(inspection("https://other.test/"), "Two", false),
    ).rejects.toMatchObject({ category: "write-failed" });
    random.mockRestore();
  });
});

describe("strict V1 decoding", () => {
  it("classifies unknown future documents before applying V1 field rules", () => {
    expect(() => decodeState('{"schemaVersion":2,"futureField":true}')).toThrow(
      expect.objectContaining({ category: "version-unsupported" }),
    );
  });
  it.each([
    "",
    "{",
    "null",
    "{}",
    '{"schemaVersion":0}',
    JSON.stringify({ ...emptyState(), schemaVersion: 2 }),
  ])("never resets malformed/future documents %j", (document) => {
    expect(() => decodeState(document)).toThrow(StorageError);
  });
  it.each([
    (s: ClientStateV1) => {
      s.serverProfiles[0]!.id = "invalid";
    },
    (s: ClientStateV1) => {
      s.serverProfiles[0]!.canonicalUrl = "https://example.test/v1";
    },
    (s: ClientStateV1) => {
      s.serverProfiles.push(s.serverProfiles[0]!);
    },
    (s: ClientStateV1) => {
      s.selectedAccountId = crypto.randomUUID();
    },
    (s: ClientStateV1) => {
      s.revision = -1;
    },
    (s: ClientStateV1) => {
      s.serverProfiles[0]!.discovery.apiVersions = ["v2"];
    },
  ])("rejects damaged references and invariants", async (damage) => {
    const state = await fixture().repository.saveInspection(inspection(), "One", false);
    damage(state);
    expect(() => decodeState(JSON.stringify(state))).toThrow(StorageError);
  });
  it("rejects secret/unknown fields rather than persisting them", () => {
    expect(() =>
      decodeState(JSON.stringify({ ...emptyState(), accessToken: "synthetic" })),
    ).toThrow(StorageError);
  });
});

describe("browser storage ports", () => {
  it("namespaces static deployments separately", () => {
    expect(browserNamespace("https://example.test/client/#/connect")).toBe(
      browserNamespace("https://example.test/client/index.html"),
    );
    expect(browserNamespace("https://example.test/")).not.toBe(
      browserNamespace("https://example.test/client/"),
    );
  });
  it("reports quota/denied writes without modifying the previous document", async () => {
    const storage: Storage = {
      length: 1,
      key: () => "state",
      removeItem: () => {},
      clear: () => {},
      getItem: () => "previous",
      setItem: () => {
        throw new DOMException("private details", "QuotaExceededError");
      },
    };
    const port = browserDocument("denied", () => storage);
    await expect(port.write("previous", "next")).rejects.toMatchObject({
      message: "quota",
      category: "quota",
    });
    expect(await port.read()).toBe("previous");
    await expect(
      browserDocument("denied", () => {
        throw new DOMException("private", "SecurityError");
      }).read(),
    ).rejects.toMatchObject({ message: "permission-denied" });
    await expect(port.write(null, "next")).rejects.toMatchObject({ category: "conflict" });
  });
  it("isolates versioned opaque secrets, overwrites and deletes idempotently", async () => {
    const { secrets } = fixture();
    const a = crypto.randomUUID();
    const b = crypto.randomUUID();
    expect(await secrets.get(a)).toBeNull();
    await secrets.put(a, new Uint8Array([0, 255, 3]));
    await secrets.put(b, new Uint8Array([7]));
    expect(await browserSecrets("test").get(a)).toEqual(new Uint8Array([0, 255, 3]));
    await secrets.put(a, new Uint8Array([4]));
    expect(await secrets.get(a)).toEqual(new Uint8Array([4]));
    await secrets.remove(a);
    await secrets.remove(a);
    expect(await secrets.get(a)).toBeNull();
    expect(await secrets.get(b)).toEqual(new Uint8Array([7]));
    expect(localStorage.getItem("test:state")).toBeNull();
    await expect(secrets.get("../other")).rejects.toMatchObject({ category: "corrupt" });
    localStorage.setItem(`test:secret:${b}`, "{");
    await expect(secrets.get(b)).rejects.toMatchObject({ category: "corrupt" });
    localStorage.setItem(`test:secret:${b}`, '{"schemaVersion":2}');
    await expect(secrets.get(b)).rejects.toMatchObject({ category: "version-unsupported" });
  });
});
