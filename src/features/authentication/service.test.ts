import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "../../shared/api/client";
import { ApiError } from "../../shared/api/error";
import type { HttpTransport } from "../../shared/api/transport";
import { browserDocument, browserSecrets } from "../../shared/storage/browser";
import { inMemoryOperationLocks } from "../../shared/storage/operation-lock";
import { ClientStateStore } from "../../shared/storage/state-store";
import { StorageError } from "../../shared/storage/errors";
import { ProfileRepository } from "../server-profiles/repository";
import { decodeState } from "../server-profiles/schema";
import { AuthApi } from "./api";
import { AuthenticationService } from "./service";
import { SessionPersistence } from "./persistence";
import { grant, user } from "../../../tests/fixtures/authentication";
import { problem } from "../../../tests/fixtures/instance";
import type { SessionGrant } from "./validation";

async function setup() {
  const clock = { value: Date.parse("2026-11-06T12:00:00Z") };
  const sessionEnd = new Date(clock.value + 30 * 86400_000).toISOString();
  let token = 1;
  const makeGrant = (overrides: Partial<SessionGrant> = {}): SessionGrant => {
    const index = token++;
    return {
      ...grant,
      access_token: `synthetic.${index}.signature`,
      refresh_token: Buffer.from(new Uint8Array(32).fill(index)).toString("base64url"),
      access_token_expires_at: new Date(clock.value + 60_000).toISOString(),
      session_expires_at: sessionEnd,
      ...overrides,
    };
  };
  const port = browserDocument("service-test");
  const secrets = browserSecrets("service-test");
  const locks = inMemoryOperationLocks();
  const store = new ClientStateStore(port, locks);
  const profiles = new ProfileRepository(store, secrets, locks);
  const persistence = new SessionPersistence(store, secrets, locks);
  const transport = vi.fn<HttpTransport>(async (url) => {
    if (url.pathname.endsWith("/v1/sessions/current")) return new Response(null, { status: 204 });
    if (url.pathname.endsWith("/v1/sessions/refresh")) return Response.json(makeGrant());
    if (url.pathname.endsWith("/v1/sessions")) return Response.json(makeGrant(), { status: 201 });
    if (url.pathname.endsWith("/v1/users/me")) return Response.json(user);
    if (url.pathname.endsWith("/v1/users")) return Response.json(user, { status: 201 });
    throw new Error("Unexpected synthetic request.");
  });
  const api = (profile: { canonicalUrl: string }) =>
    new AuthApi(new ApiClient({ baseUrl: profile.canonicalUrl, transport }));
  const service = new AuthenticationService(persistence, api, () => clock.value);
  const addProfile = async (root: string) =>
    (
      await profiles.saveInspection(
        {
          kind: "supported",
          root,
          metadata: {
            service: "windwatcher",
            api_versions: ["v1"],
            auth_methods: ["password"],
            registration: "open",
          },
        },
        "Server",
        false,
      )
    ).serverProfiles.find((p) => p.canonicalUrl === root)!.id;
  const profileId = await addProfile("https://example.test/proxy/");
  const signal = () => new AbortController().signal;
  const login = () => service.login(profileId, "alice", "synthetic password", signal());
  const selected = async () => (await store.load()).selectedAccountId!;
  const refreshCalls = () =>
    transport.mock.calls.filter(([url]) => url.pathname.endsWith("/sessions/refresh"));
  return {
    clock,
    makeGrant,
    port,
    secrets,
    locks,
    store,
    profiles,
    persistence,
    transport,
    service,
    api,
    addProfile,
    profileId,
    signal,
    login,
    selected,
    refreshCalls,
  };
}
beforeEach(() => localStorage.clear());

describe("authentication orchestration", () => {
  it.each([false, true])(
    "revalidates the selected session after invalid credentials (account-specific: %s)",
    async (reauthenticate) => {
      const f = await setup();
      await f.login();
      const id = await f.selected();
      f.transport.mockClear();
      f.transport.mockResolvedValueOnce(
        Response.json(problem(401, "auth.invalid_credentials"), {
          status: 401,
          headers: { "Content-Type": "application/problem+json" },
        }),
      );
      await expect(
        f.service.login(
          f.profileId,
          reauthenticate ? "alice" : "bob",
          "wrong",
          f.signal(),
          reauthenticate ? id : undefined,
        ),
      ).rejects.toMatchObject({ category: "http" });
      expect(f.service.getSnapshot()).toMatchObject({ kind: "ready", accountId: id });
      expect((await f.store.load()).selectedAccountId).toBe(id);
      expect(
        f.transport.mock.calls.filter(([url]) => url.pathname.endsWith("/users/me")),
      ).toHaveLength(1);
    },
  );
  it("does not restore the previous session when a newer selection wins during failed login", async () => {
    const f = await setup();
    await f.login();
    const a = await f.selected();
    const profile = await f.addProfile("https://other.test/");
    await f.service.login(profile, "alice", "synthetic", f.signal());
    const b = await f.selected();
    await f.service.switchAccount(a);
    let finish!: (response: Response) => void;
    let started!: () => void;
    const submitted = new Promise<void>((resolve) => {
      started = resolve;
    });
    f.transport.mockImplementationOnce(async () => {
      started();
      return new Promise<Response>((resolve) => {
        finish = resolve;
      });
    });
    const login = f.service.login(f.profileId, "bob", "wrong", f.signal());
    const failed = expect(login).rejects.toBeInstanceOf(Error);
    await submitted;
    await f.service.switchAccount(b);
    finish(Response.json(problem(401, "auth.invalid_credentials"), { status: 401 }));
    await failed;
    expect(f.service.getSnapshot()).toMatchObject({ kind: "ready", accountId: b });
    expect((await f.store.load()).selectedAccountId).toBe(b);
  });
  it("does not let a late logout response replace a newly selected account", async () => {
    const f = await setup();
    await f.login();
    const a = await f.selected();
    const profile = await f.addProfile("https://other.test/");
    await f.service.login(profile, "alice", "synthetic", f.signal());
    const b = await f.selected();
    await f.service.switchAccount(a);
    let finish!: (response: Response) => void;
    let started!: () => void;
    const submitted = new Promise<void>((resolve) => {
      started = resolve;
    });
    f.transport.mockImplementationOnce(async () => {
      started();
      return new Promise<Response>((resolve) => {
        finish = resolve;
      });
    });
    const logout = f.service.logoutAccount(a);
    await submitted;
    await f.service.switchAccount(b);
    finish(new Response(null, { status: 204 }));
    await logout;
    expect(f.service.getSnapshot()).toMatchObject({ kind: "ready", accountId: b });
    expect((await f.store.load()).selectedAccountId).toBe(b);
  });
  it("does not let a concurrent login escape a server forget", async () => {
    const f = await setup();
    await f.login();
    const id = await f.selected();
    const remove = f.secrets.remove.bind(f.secrets);
    let release!: () => void;
    let started!: () => void;
    const submitted = new Promise<void>((resolve) => {
      started = resolve;
    });
    vi.spyOn(f.secrets, "remove").mockImplementationOnce(async (...args) => {
      started();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      await remove(...args);
    });
    const forget = f.service.forgetServer(f.profileId);
    await submitted;
    const login = f.login();
    const rejected = expect(login).rejects.toBeInstanceOf(StorageError);
    release();
    await forget;
    await rejected;
    expect(await f.secrets.get(id)).toBeNull();
    expect(await f.store.load()).toMatchObject({
      accounts: [],
      serverProfiles: [],
      authOperations: [],
      selectedAccountId: null,
    });
  });
  it("finishes a sent refresh only for its old account after a context switch", async () => {
    const f = await setup();
    await f.login();
    const a = await f.selected();
    const other = await f.addProfile("https://other.test/");
    await f.service.login(other, "alice", "synthetic", f.signal());
    const b = await f.selected();
    await f.service.switchAccount(a);
    let finish!: (response: Response) => void;
    let started!: () => void;
    const submitted = new Promise<void>((resolve) => {
      started = resolve;
    });
    f.transport.mockImplementationOnce(async () => {
      started();
      return new Promise<Response>((resolve) => {
        finish = resolve;
      });
    });
    const refresh = f.service.refreshAccount(a);
    await submitted;
    await f.service.switchAccount(b);
    finish(Response.json(f.makeGrant()));
    await refresh;
    expect(f.service.getSnapshot()).toMatchObject({ kind: "ready", accountId: b });
    const state = await f.store.load();
    expect(state.selectedAccountId).toBe(b);
    expect(state.accounts.find((row) => row.id === a)?.session?.generation).toBe(2);
    expect(state.accounts.find((row) => row.id === b)?.session?.generation).toBe(1);
  });
  it("serializes logout after refresh and revokes the latest bound bearer", async () => {
    const f = await setup();
    await f.login();
    const id = await f.selected();
    const renewed = f.makeGrant();
    let finish!: (response: Response) => void;
    let started!: () => void;
    const submitted = new Promise<void>((resolve) => {
      started = resolve;
    });
    f.transport.mockImplementationOnce(async () => {
      started();
      return new Promise<Response>((resolve) => {
        finish = resolve;
      });
    });
    const refresh = f.service.refreshAccount(id);
    await submitted;
    const logout = f.service.logoutAccount(id);
    finish(Response.json(renewed));
    await refresh;
    expect(await logout).toMatchObject({ remoteRevocation: "confirmed" });
    const request = f.transport.mock.calls.find(([url]) =>
      url.pathname.endsWith("/sessions/current"),
    );
    expect(request?.[1].headers.get("Authorization")).toBe(`Bearer ${renewed.access_token}`);
    expect(await f.secrets.get(id)).toBeNull();
    expect((await f.store.load()).selectedAccountId).toBeNull();
  });
  it("keeps metadata recoverable after logout secret deletion but failed metadata commit", async () => {
    const f = await setup();
    await f.login();
    const id = await f.selected();
    vi.spyOn(f.port, "write").mockRejectedValueOnce(new StorageError("quota"));
    await expect(f.service.logoutAccount(id)).rejects.toMatchObject({ category: "quota" });
    expect(await f.secrets.get(id)).toBeNull();
    expect((await f.store.load()).accounts[0]?.session).toBeDefined();
    expect(await f.service.restoreSelected(f.signal())).toMatchObject({
      kind: "error",
      category: "storage-write-failed",
    });
    const restarted = new AuthenticationService(f.persistence, f.api, () => f.clock.value);
    expect(await restarted.restoreSelected(f.signal())).toMatchObject({
      kind: "needs-login",
      reason: "missing",
    });
    expect(await f.service.logoutAccount(id)).toMatchObject({
      localSignedOut: true,
      remoteRevocation: "not-attempted",
    });
  });
  it.each([204, 401, 429, 500])(
    "logs out locally without refresh and reports remote HTTP %s honestly",
    async (status) => {
      const f = await setup();
      await f.login();
      const id = await f.selected();
      f.transport.mockClear();
      f.transport.mockResolvedValueOnce(new Response(null, { status }));
      expect(await f.service.logoutAccount(id)).toEqual({
        localSignedOut: true,
        remoteRevocation: status === 204 ? "confirmed" : "unconfirmed",
      });
      expect(await f.secrets.get(id)).toBeNull();
      expect(await f.store.load()).toMatchObject({
        selectedAccountId: null,
        accounts: [{ id }],
        authOperations: [],
      });
      expect((await f.store.load()).accounts[0]?.session).toBeUndefined();
      expect(f.transport).toHaveBeenCalledOnce();
      expect(f.refreshCalls()).toHaveLength(0);
      expect(await f.service.switchAccount(id)).toMatchObject({
        kind: "needs-login",
        reason: "missing",
      });
      expect(await f.service.logoutAccount(id)).toMatchObject({
        remoteRevocation: "not-attempted",
      });
    },
  );
  it("keeps another active account verified when logging out an inactive session", async () => {
    const f = await setup();
    await f.login();
    const a = await f.selected();
    const profileId = await f.addProfile("https://other.test/");
    await f.service.login(profileId, "alice", "synthetic", f.signal());
    const b = await f.selected();
    const before = f.service.getSnapshot();
    f.transport.mockClear();
    await f.service.logoutAccount(a);
    expect(f.service.getSnapshot()).toEqual(before);
    expect((await f.store.load()).selectedAccountId).toBe(b);
    expect(await f.secrets.get(b)).not.toBeNull();
    expect(f.transport.mock.calls[0]![0].origin).toBe("https://example.test");
  });
  it("does not report local logout success when deletion cannot be verified", async () => {
    const f = await setup();
    await f.login();
    const id = await f.selected();
    vi.spyOn(f.secrets, "remove").mockRejectedValueOnce(new StorageError("locked"));
    f.transport.mockClear();
    await expect(f.service.logoutAccount(id)).rejects.toMatchObject({ category: "locked" });
    expect(f.service.getSnapshot().kind).not.toBe("ready");
    expect((await f.store.load()).accounts[0]?.session).toBeDefined();
    expect(f.transport).not.toHaveBeenCalled();
  });
  it("does not refresh an expired bearer solely for logout", async () => {
    const f = await setup();
    await f.login();
    const id = await f.selected();
    f.clock.value += 120_000;
    f.transport.mockClear();
    expect(await f.service.logoutAccount(id)).toMatchObject({ remoteRevocation: "not-attempted" });
    expect(f.transport).not.toHaveBeenCalled();
  });
  it("removes only the requested saved account without remote logout", async () => {
    const f = await setup();
    await f.login();
    const id = await f.selected();
    f.transport.mockClear();
    await f.service.removeSavedAccount(id);
    expect((await f.store.load()).accounts).toEqual([]);
    expect((await f.store.load()).serverProfiles).toHaveLength(1);
    expect(f.transport).not.toHaveBeenCalled();
    expect(f.service.getSnapshot().kind).toBe("signed-out");
  });
  it("switches persisted accounts without deleting inactive credentials and fences old contexts", async () => {
    const f = await setup();
    await f.login();
    const a = await f.selected();
    const old = f.service.activeContext()!;
    const profile = await f.addProfile("https://second.test/");
    await f.service.login(profile, "alice", "synthetic password", f.signal());
    const b = await f.selected();
    expect(await f.service.isCurrent(old)).toBe(false);
    expect(await f.service.switchAccount(a)).toMatchObject({ kind: "ready", accountId: a });
    expect(await f.service.switchAccount(b)).toMatchObject({ kind: "ready", accountId: b });
    await f.service.switchAccount(null);
    expect(f.service.getSnapshot()).toEqual({ kind: "signed-out" });
    expect((await f.store.load()).selectedAccountId).toBeNull();
    expect(await f.secrets.get(a)).not.toBeNull();
    expect(await f.secrets.get(b)).not.toBeNull();
  });
  it("selects a saved signed-out account for reauthentication", async () => {
    const f = await setup();
    const state = await f.profiles.registerAccount(f.profileId, user.id, user.username);
    const id = state.accounts[0]!.id;
    expect(await f.service.switchAccount(id)).toMatchObject({
      kind: "needs-login",
      accountId: id,
      reason: "missing",
    });
    expect((await f.store.load()).selectedAccountId).toBe(id);
  });
  it("fails closed when a selection write fails", async () => {
    const f = await setup();
    await f.login();
    vi.spyOn(f.port, "write").mockRejectedValueOnce(new StorageError("quota"));
    await expect(f.service.switchAccount(null)).rejects.toMatchObject({ category: "quota" });
    expect(f.service.getSnapshot()).toMatchObject({ kind: "error", category: "storage-quota" });
  });
  it("restores the selected account when another profile's orphan cannot be removed", async () => {
    const f = await setup();
    await f.login();
    const accountId = await f.selected();
    const otherProfile = await f.addProfile("https://orphan.test/");
    const orphanId = crypto.randomUUID();
    const operationId = crypto.randomUUID();
    await f.store.update((state) => {
      state.authOperations.push({
        accountId: orphanId,
        profileId: otherProfile,
        userId: user.id,
        sessionId: grant.session_id,
        operationId,
        kind: "create",
        phase: "prepared",
        expectedGeneration: 0,
        targetGeneration: 1,
        startedAt: new Date().toISOString(),
      });
    });
    const remove = vi.spyOn(f.secrets, "remove").mockRejectedValue(new StorageError("locked"));
    const restarted = new AuthenticationService(f.persistence, f.api, () => f.clock.value);
    expect(await restarted.restoreSelected(f.signal())).toMatchObject({ kind: "ready", accountId });
    expect(remove).toHaveBeenCalledOnce();
    expect((await f.store.load()).authOperations).toMatchObject([
      { accountId: orphanId, operationId },
    ]);
  });
  it("does not authenticate when the selected account's own vault read fails", async () => {
    const f = await setup();
    await f.login();
    const accountId = await f.selected();
    vi.spyOn(f.secrets, "get").mockRejectedValue(new StorageError("locked"));
    const restarted = new AuthenticationService(f.persistence, f.api, () => f.clock.value);
    expect(await restarted.restoreSelected(f.signal())).toMatchObject({
      kind: "error",
      category: "storage-locked",
      accountId,
    });
  });
  it("registration creates only a remote identity and preserves exact password bytes", async () => {
    const f = await setup();
    const password = "  e\u0301 👩‍💻 synthetic password  ";
    expect(await f.service.register(f.profileId, "Alice", password, f.signal())).toEqual(user);
    expect(f.transport).toHaveBeenCalledOnce();
    expect(f.transport.mock.calls[0]![0].href).toBe("https://example.test/proxy/v1/users");
    expect(JSON.parse(f.transport.mock.calls[0]![1].body!)).toEqual({
      username: "Alice",
      password,
    });
    const state = await f.store.load();
    expect(state.accounts).toEqual([]);
    expect(state.authOperations).toEqual([]);
    expect(state.selectedAccountId).toBeNull();
    expect(f.service.getSnapshot()).toEqual({ kind: "signed-out" });
  });
  it("publishes only safe identity after login, me and verified storage, then restores selected", async () => {
    const f = await setup();
    await f.login();
    const id = await f.selected();
    expect(f.service.getSnapshot()).toEqual({
      kind: "ready",
      accountId: id,
      profileId: f.profileId,
      userId: user.id,
      username: user.username,
    });
    const restarted = new AuthenticationService(f.persistence, f.api, () => f.clock.value);
    expect(await restarted.restoreSelected(f.signal())).toMatchObject({
      kind: "ready",
      accountId: id,
    });
    expect(f.refreshCalls()).toHaveLength(0);
    const snapshot = JSON.stringify(restarted.getSnapshot());
    expect(snapshot).not.toContain("token");
    expect(snapshot).not.toContain("password");
    expect(JSON.stringify(await f.store.load())).not.toContain("signature");
  });
  it.each(["disabled", "malformed", "network"] as const)(
    "does not invent a local account when /me is %s",
    async (mode) => {
      const f = await setup();
      f.transport.mockResolvedValueOnce(Response.json(f.makeGrant(), { status: 201 }));
      if (mode === "disabled")
        f.transport.mockResolvedValueOnce(Response.json({ ...user, disabled_at: user.updated_at }));
      if (mode === "malformed")
        f.transport.mockResolvedValueOnce(Response.json({ ...user, id: "alice" }));
      if (mode === "network")
        f.transport.mockRejectedValueOnce(new Error("untrusted transport detail"));
      await expect(f.login()).rejects.toBeInstanceOf(Error);
      expect((await f.store.load()).accounts).toEqual([]);
      expect((await f.store.load()).authOperations).toEqual([]);
      expect(f.service.getSnapshot().kind).toBe("signed-out");
    },
  );
  it("does not rebind an explicit reauthentication account to a different user", async () => {
    const f = await setup();
    await f.login();
    const id = await f.selected();
    f.transport.mockResolvedValueOnce(Response.json(f.makeGrant(), { status: 201 }));
    f.transport.mockResolvedValueOnce(
      Response.json({ ...user, id: "019a0000-0000-7000-8000-000000000004" }),
    );
    await expect(
      f.service.login(f.profileId, "alice", "synthetic password", f.signal(), id),
    ).rejects.toMatchObject({ reason: "identity" });
    expect((await f.store.load()).accounts).toHaveLength(1);
    expect((await f.store.load()).accounts[0]?.serverUserId).toBe(user.id);
  });
  it("only attempts fresh-session cleanup before persistence, never revokes an established account on a vault error", async () => {
    const f = await setup();
    f.transport.mockResolvedValueOnce(Response.json(f.makeGrant(), { status: 201 }));
    f.transport.mockRejectedValueOnce(new Error("synthetic identity transport loss"));
    await expect(f.login()).rejects.toMatchObject({ category: "transport" });
    expect(
      f.transport.mock.calls.filter(([, request]) => request.method === "DELETE"),
    ).toHaveLength(1);
    await f.login();
    vi.spyOn(f.secrets, "put").mockRejectedValueOnce(new StorageError("locked"));
    await expect(f.login()).rejects.toMatchObject({ category: "locked" });
    expect(
      f.transport.mock.calls.filter(([, request]) => request.method === "DELETE"),
    ).toHaveLength(1);
  });
  it("never lets an older cancelled login select its server after a newer login", async () => {
    const f = await setup();
    const other = await f.addProfile("https://other.test/");
    let finish: (response: Response) => void = () => {};
    let started: () => void = () => {};
    const submitted = new Promise<void>((resolve) => {
      started = resolve;
    });
    f.transport.mockImplementationOnce(async () => {
      started();
      return new Promise<Response>((resolve) => {
        finish = resolve;
      });
    });
    const first = f.login();
    const rejected = expect(first).rejects.toMatchObject({ category: "cancelled" });
    await submitted;
    await f.service.login(other, "alice", "synthetic password", f.signal());
    finish(Response.json(f.makeGrant(), { status: 201 }));
    await rejected;
    expect(f.service.getSnapshot()).toMatchObject({ kind: "ready", profileId: other });
    expect((await f.store.load()).accounts).toHaveLength(1);
    expect((await f.store.load()).accounts[0]?.serverProfileId).toBe(other);
  });
  it("clears the rendered authenticated context when its profile is forgotten", async () => {
    const f = await setup();
    await f.login();
    await f.profiles.forgetProfile(f.profileId);
    await vi.waitFor(() => expect(f.service.getSnapshot()).toEqual({ kind: "signed-out" }));
    expect((await f.store.load()).selectedAccountId).toBeNull();
  });
  it("preserves independent accounts on two saved roots and never shares bearer defaults", async () => {
    const f = await setup();
    await f.login();
    const first = await f.selected();
    const secondProfile = await f.addProfile("https://other.test/prefix/");
    await f.service.login(secondProfile, "alice", "synthetic password", f.signal());
    const second = await f.selected();
    expect(second).not.toBe(first);
    expect((await f.store.load()).accounts).toHaveLength(2);
    const firstBytes = await f.secrets.get(first);
    await f.service.currentUser(first, f.signal());
    await f.service.currentUser(second, f.signal());
    const gets = f.transport.mock.calls.filter(([url]) => url.pathname.endsWith("/users/me"));
    expect(gets.at(-2)![0].origin).toBe("https://example.test");
    expect(gets.at(-1)![0].origin).toBe("https://other.test");
    expect(gets.at(-2)![1].headers.get("Authorization")).not.toBe(
      gets.at(-1)![1].headers.get("Authorization"),
    );
    expect(await f.secrets.get(first)).toEqual(firstBytes);
    for (const [url, request] of f.transport.mock.calls)
      if (!url.pathname.endsWith("/users/me"))
        expect(request.headers.has("Authorization")).toBe(false);
  });
  it("invalidates an established ready context after failed replacement leaves a pending intent", async () => {
    const f = await setup();
    await f.login();
    vi.spyOn(f.secrets, "put").mockRejectedValueOnce(new StorageError("locked"));
    await expect(f.login()).rejects.toMatchObject({ category: "locked" });
    expect(f.service.getSnapshot()).toMatchObject({
      kind: "needs-login",
      reason: "recovery-required",
    });
  });
  it("refuses unsupported cross-context coordination before sending a password", async () => {
    const f = await setup();
    const locks = { ...f.locks, supported: false };
    const service = new AuthenticationService(
      new SessionPersistence(f.store, f.secrets, locks),
      f.api,
    );
    await expect(
      service.login(f.profileId, "alice", "synthetic password", f.signal()),
    ).rejects.toMatchObject({ reason: "coordination" });
    expect(f.transport).not.toHaveBeenCalled();
  });
});

describe("one-use refresh state machine", () => {
  it("makes one POST for parallel callers and reloads the persisted generation", async () => {
    const f = await setup();
    await f.login();
    const id = await f.selected();
    await Promise.all(Array.from({ length: 15 }, () => f.service.refreshAccount(id, f.signal())));
    expect(f.refreshCalls()).toHaveLength(1);
    expect(f.refreshCalls()[0]![1].headers.has("Authorization")).toBe(false);
    expect((await f.store.load()).accounts[0]?.session?.generation).toBe(2);
    expect((await f.store.load()).authOperations).toEqual([]);
  });
  it("serializes parallel expiring authenticated GETs without repeated rotations", async () => {
    const f = await setup();
    await f.login();
    f.clock.value += 58_000;
    const id = await f.selected();
    const users = await Promise.all(
      Array.from({ length: 10 }, () => f.service.currentUser(id, f.signal())),
    );
    expect(users.every((identity) => identity.id === user.id)).toBe(true);
    expect(f.refreshCalls()).toHaveLength(1);
  });
  it("performs one refresh and one GET replay for a corroborated access-token 401", async () => {
    const f = await setup();
    await f.login();
    const id = await f.selected();
    f.transport.mockResolvedValueOnce(
      Response.json(problem(401, "auth.invalid_access_token"), { status: 401 }),
    );
    expect(await f.service.currentUser(id, f.signal())).toEqual(user);
    expect(f.refreshCalls()).toHaveLength(1);
    expect(
      f.transport.mock.calls.filter(([url]) => url.pathname.endsWith("/users/me")),
    ).toHaveLength(3);
  });
  it("does not loop when GET still rejects the confirmed renewed access token", async () => {
    const f = await setup();
    await f.login();
    f.transport.mockResolvedValueOnce(
      Response.json(problem(401, "auth.invalid_access_token"), { status: 401 }),
    );
    f.transport.mockResolvedValueOnce(Response.json(f.makeGrant()));
    f.transport.mockResolvedValueOnce(
      Response.json(problem(401, "auth.invalid_access_token"), { status: 401 }),
    );
    expect(await f.service.restoreSelected(f.signal())).toMatchObject({
      kind: "needs-login",
      reason: "invalid",
    });
    expect(f.refreshCalls()).toHaveLength(1);
  });
  it("does not renew at or after absolute session expiry", async () => {
    const f = await setup();
    await f.login();
    f.clock.value += 30 * 86400_000;
    expect(await f.service.restoreSelected(f.signal())).toMatchObject({
      kind: "needs-login",
      reason: "expired",
    });
    expect(f.refreshCalls()).toHaveLength(0);
  });
  it.each([
    "network",
    "invalid",
    "malformed",
    "wrong-session",
    "extended-expiry",
    "rate-limited",
  ] as const)("never replays an uncertain/invalid refresh after %s", async (mode) => {
    const f = await setup();
    await f.login();
    f.clock.value += 61_000;
    if (mode === "network")
      f.transport.mockRejectedValueOnce(new Error("untrusted secret transport details"));
    if (mode === "invalid")
      f.transport.mockResolvedValueOnce(
        Response.json(problem(401, "auth.invalid_refresh_token"), { status: 401 }),
      );
    if (mode === "malformed")
      f.transport.mockResolvedValueOnce(
        Response.json({ ...f.makeGrant(), refresh_token: "malformed" }),
      );
    if (mode === "wrong-session")
      f.transport.mockResolvedValueOnce(
        Response.json(f.makeGrant({ session_id: "019a0000-0000-7000-8000-000000000004" })),
      );
    if (mode === "extended-expiry")
      f.transport.mockResolvedValueOnce(
        Response.json(f.makeGrant({ session_expires_at: "2030-01-01T00:00:00Z" })),
      );
    if (mode === "rate-limited")
      f.transport.mockResolvedValueOnce(
        Response.json(problem(429, "rate_limit.exceeded"), {
          status: 429,
          headers: { "Retry-After": "5" },
        }),
      );
    const first = await f.service.restoreSelected(f.signal());
    expect(first.kind).not.toBe("ready");
    if (mode === "rate-limited")
      expect(first).toMatchObject({ kind: "error", category: "rate-limited", retryAfterMs: 5000 });
    const second = await f.service.restoreSelected(f.signal());
    expect(second).toMatchObject({ kind: "needs-login", reason: "recovery-required" });
    expect(f.refreshCalls()).toHaveLength(1);
    expect((await f.store.load()).accounts).toHaveLength(1);
  });
  it("a failed vault overwrite after remote rotation never reuses the old refresh", async () => {
    const f = await setup();
    await f.login();
    f.clock.value += 61_000;
    const id = await f.selected();
    const before = await f.secrets.get(id);
    vi.spyOn(f.secrets, "put").mockRejectedValueOnce(new StorageError("locked"));
    expect(await f.service.restoreSelected(f.signal())).toMatchObject({
      kind: "error",
      category: "storage-locked",
    });
    expect(await f.secrets.get(id)).toEqual(before);
    expect(await f.service.restoreSelected(f.signal())).toMatchObject({
      kind: "needs-login",
      reason: "recovery-required",
    });
    expect(f.refreshCalls()).toHaveLength(1);
  });
  it("recovers a reported failed write only after exact new-generation readback", async () => {
    const f = await setup();
    await f.login();
    f.clock.value += 61_000;
    const put = f.secrets.put.bind(f.secrets);
    vi.spyOn(f.secrets, "put").mockImplementationOnce(async (...args) => {
      await put(...args);
      throw new StorageError("write-failed");
    });
    expect(await f.service.restoreSelected(f.signal())).toMatchObject({ kind: "ready" });
    expect((await f.store.load()).accounts[0]?.session?.generation).toBe(2);
    expect(f.refreshCalls()).toHaveLength(1);
  });
  it("recovers a verified new envelope after a failed metadata commit without replaying refresh", async () => {
    const f = await setup();
    await f.login();
    f.clock.value += 61_000;
    const write = f.port.write.bind(f.port);
    const failing = vi.spyOn(f.port, "write").mockImplementation(async (expected, text, lease) => {
      if (decodeState(text).accounts.some((row) => row.session?.generation === 2))
        throw new StorageError("quota");
      await write(expected, text, lease);
    });
    expect(await f.service.restoreSelected(f.signal())).toMatchObject({
      kind: "error",
      category: "storage-quota",
    });
    failing.mockRestore();
    expect(await f.service.restoreSelected(f.signal())).toMatchObject({ kind: "ready" });
    expect(f.refreshCalls()).toHaveLength(1);
    expect((await f.store.load()).authOperations).toEqual([]);
  });
  it("does not invalidate credentials on an ordinary GET network failure or rate limit", async () => {
    const f = await setup();
    await f.login();
    const id = await f.selected();
    const before = await f.secrets.get(id);
    f.transport.mockRejectedValueOnce(new Error("untrusted transport details"));
    expect(await f.service.restoreSelected(f.signal())).toMatchObject({
      kind: "error",
      category: "network",
    });
    f.transport.mockResolvedValueOnce(
      Response.json(problem(429, "rate_limit.exceeded"), {
        status: 429,
        headers: { "Retry-After": "10" },
      }),
    );
    expect(await f.service.restoreSelected(f.signal())).toMatchObject({
      kind: "error",
      category: "rate-limited",
      retryAfterMs: 10000,
    });
    expect(await f.secrets.get(id)).toEqual(before);
    expect((await f.store.load()).authOperations).toEqual([]);
    expect(await f.service.restoreSelected(f.signal())).toMatchObject({ kind: "ready" });
    expect(f.refreshCalls()).toHaveLength(0);
  });
  it("blocks disabled and mismatched identities even with a usable stale access token", async () => {
    const f = await setup();
    await f.login();
    f.transport.mockResolvedValueOnce(Response.json({ ...user, disabled_at: user.updated_at }));
    expect(await f.service.restoreSelected(f.signal())).toMatchObject({
      kind: "needs-login",
      reason: "disabled",
    });
    f.transport.mockResolvedValueOnce(
      Response.json({ ...user, id: "019a0000-0000-7000-8000-000000000004" }),
    );
    expect(await f.service.restoreSelected(f.signal())).toMatchObject({
      kind: "needs-login",
      reason: "identity",
    });
    expect(f.refreshCalls()).toHaveLength(0);
  });
  it("one cancelled waiter does not discard another waiter's valid rotating result", async () => {
    const f = await setup();
    await f.login();
    const id = await f.selected();
    let finish: (response: Response) => void = () => {};
    let started: () => void = () => {};
    const submitted = new Promise<void>((resolve) => {
      started = resolve;
    });
    f.transport.mockImplementationOnce(async () => {
      started();
      return new Promise<Response>((resolve) => {
        finish = resolve;
      });
    });
    const controller = new AbortController();
    const first = f.service.refreshAccount(id, controller.signal);
    const rejected = expect(first).rejects.toMatchObject({ category: "cancelled" });
    const second = f.service.refreshAccount(id, f.signal());
    await submitted;
    controller.abort();
    await rejected;
    finish(Response.json(f.makeGrant()));
    await second;
    expect(f.refreshCalls()).toHaveLength(1);
    expect((await f.store.load()).accounts[0]?.session?.generation).toBe(2);
  });
  it("blocks only its own account on stale or missing secret data", async () => {
    const f = await setup();
    await f.login();
    const id = await f.selected();
    await f.secrets.remove(id);
    expect(await f.service.restoreSelected(f.signal())).toMatchObject({
      kind: "needs-login",
      reason: "missing",
    });
    expect(f.refreshCalls()).toHaveLength(0);
  });
  it("does not send requests after cancellation or invent signature verification", async () => {
    const f = await setup();
    const controller = new AbortController();
    controller.abort();
    await expect(
      f.service.login(f.profileId, "alice", "synthetic password", controller.signal),
    ).rejects.toBeInstanceOf(ApiError);
    expect(f.transport).not.toHaveBeenCalled();
  });
});
