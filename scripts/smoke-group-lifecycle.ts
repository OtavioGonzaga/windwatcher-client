import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Database } from "bun:sqlite";
import { ApiClient } from "../src/shared/api/client";
import { ApiError } from "../src/shared/api/error";
import { AuthApi } from "../src/features/authentication/api";
import { ConversationsApi } from "../src/features/conversations/api";

// Opt-in disposable server evidence, never operator data. No credentials or diagnostics are printed.
const PINNED_SOURCE = "d83d5d9210ccd35b0c29f03ad678b42644c1d196";
const source = process.argv[2];
if (!source || process.argv.length !== 3) {
  console.error(
    "Usage: bun scripts/smoke-group-lifecycle.ts /absolute/path/to/pinned/server/source",
  );
  process.exit(1);
}
const root = resolve(source);
const revision = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: root });
const clean = Bun.spawnSync(["git", "status", "--porcelain", "--untracked-files=no"], {
  cwd: root,
});
if (
  revision.exitCode !== 0 ||
  revision.stdout.toString().trim() !== PINNED_SOURCE ||
  clean.exitCode !== 0 ||
  clean.stdout.toString().trim()
) {
  console.error("Requires clean pinned Server 0.1.1 source.");
  process.exit(1);
}
const build = Bun.spawn(
  ["cargo", "build", "--locked", "-p", "windwatcher-server", "--target-dir", join(root, "target")],
  {
    cwd: root,
    env: { ...process.env, CARGO_BUILD_JOBS: "4" },
    stdout: "ignore",
    stderr: "ignore",
  },
);
if ((await build.exited) !== 0) {
  console.error("Pinned server build failed.");
  process.exit(1);
}
const sandbox = await mkdtemp(join(tmpdir(), "windwatcher-group-lifecycle-"));
await chmod(sandbox, 0o700);
let stage = "configuration";
let assertions = 0;
function check(value: boolean) {
  if (!value) throw new Error("Lifecycle contract assertion failed.");
  assertions++;
}
const blob = (uuid: string) => Buffer.from(uuid.replaceAll("-", ""), "hex");
try {
  const config = join(sandbox, "server.toml");
  const key = join(sandbox, "signing.key");
  const database = join(sandbox, "groups.db");
  await writeFile(key, crypto.getRandomValues(new Uint8Array(64)), { mode: 0o600 });
  await writeFile(
    config,
    `
[storage]
provider = "sqlite"
[storage.sqlite]
url = ${JSON.stringify(database)}
create_if_missing = true
[auth]
registration = "open"
[auth.jwt]
issuer = "disposable-group-lifecycle"
secret_file = ${JSON.stringify(key)}
[server]
bind = "127.0.0.1:0"
shutdown_grace_period = "1s"
[http.rate_limit]
enabled = false
[logging]
filter = "info"
format = "json"
`,
    { mode: 0o600 },
  );
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith("WINDWATCHER")),
  );
  Object.assign(env, {
    HOME: sandbox,
    XDG_CONFIG_HOME: sandbox,
    XDG_DATA_HOME: sandbox,
    XDG_STATE_HOME: sandbox,
  });
  const binary = join(
    root,
    "target",
    "debug",
    process.platform === "win32" ? "windwatcher.exe" : "windwatcher",
  );
  stage = "migration";
  const migrate = Bun.spawn([binary, "--config", config, "migrate", "--storage"], {
    cwd: sandbox,
    env,
    stdout: "ignore",
    stderr: "ignore",
  });
  if ((await migrate.exited) !== 0) throw new Error("Disposable migration failed.");
  const server = Bun.spawn([binary, "--config", config, "serve"], {
    cwd: sandbox,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  let ready: (address: string) => void = () => {};
  const address = new Promise<string>((accept) => {
    ready = accept;
  });
  async function consume(stream: ReadableStream<Uint8Array>) {
    let pending = "";
    const decoder = new TextDecoder();
    for await (const chunk of stream) {
      pending += decoder.decode(chunk, { stream: true });
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      if (pending.length > 8192) throw new Error("Unexpected diagnostic size.");
      for (const line of lines) {
        if (!line.includes("server_listening")) continue;
        const event: unknown = JSON.parse(line);
        if (
          event &&
          typeof event === "object" &&
          "fields" in event &&
          event.fields &&
          typeof event.fields === "object" &&
          "bind" in event.fields &&
          typeof event.fields.bind === "string" &&
          /^127\.0\.0\.1:\d+$/.test(event.fields.bind)
        )
          ready(event.fields.bind);
      }
    }
  }
  const drains = Promise.all([consume(server.stdout), consume(server.stderr)]);
  void drains.catch(() => {});
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    stage = "startup";
    const bound = await Promise.race([
      address,
      server.exited.then(() => {
        throw new Error("Server exited early.");
      }),
      drains.then(() => {
        throw new Error("Server output ended early.");
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Startup timeout.")), 20000);
      }),
    ]);
    clearTimeout(timer);
    let lastStatus = 0;
    const writes: { method: string; key: boolean; body: boolean; contentType: boolean }[] = [];
    let dropNext = false;
    const client = new ApiClient({
      baseUrl: `http://${bound}/`,
      transport: async (url, init) => {
        if (url.pathname.includes("/conversations/") && init.method !== "GET") {
          writes.push({
            method: init.method,
            key: new Headers(init.headers).has("Idempotency-Key"),
            body: init.body !== undefined,
            contentType: new Headers(init.headers).has("Content-Type"),
          });
        }
        const response = await fetch(url, { ...init, redirect: "manual", credentials: "omit" });
        lastStatus = response.status;
        if (dropNext && url.pathname.includes("/conversations/") && init.method !== "GET") {
          dropNext = false;
          await response.body?.cancel();
          throw new Error("Synthetic response loss after real server processing.");
        }
        return response;
      },
    });
    const auth = new AuthApi(client),
      api = new ConversationsApi(client);
    const password = crypto.randomUUID();
    async function identity(username: string) {
      const user = await auth.register(username, password);
      return { user, token: (await auth.login(username, password)).access_token };
    }
    async function code(operation: () => Promise<unknown>, status: number, expected: string) {
      try {
        await operation();
        throw new Error("Expected rejection.");
      } catch (error) {
        check(
          error instanceof ApiError &&
            error.metadata.status === status &&
            error.metadata.code === expected,
        );
      }
    }
    stage = "identities";
    const owner = await identity("owner"),
      admin = await identity("admin"),
      member = await identity("member"),
      outsider = await identity("outsider");
    const group = await api.createGroup(
      owner.token,
      { kind: "group", title: "Lifecycle", participant_ids: [admin.user.id, member.user.id] },
      crypto.randomUUID(),
      {},
    );
    const id = group.id;
    stage = "rename-and-permissions";
    check((await api.renameGroup(owner.token, id, " exact 😀 ", {})).title === " exact 😀 ");
    const renamed = await api.get(owner.token, id, {});
    check(
      (await api.renameGroup(owner.token, id, " exact 😀 ", {})).updated_at === renamed.updated_at,
    );
    await code(
      () => api.renameGroup(member.token, id, "Denied", {}),
      403,
      "conversation.insufficient_permissions",
    );
    await code(() => api.get(outsider.token, id, {}), 404, "conversation.not_found");
    stage = "membership";
    check(
      (await api.addMember(owner.token, id, outsider.user.id, {})).role === "member" &&
        lastStatus === 201,
    );
    check(
      (await api.addMember(owner.token, id, outsider.user.id, {})).role === "member" &&
        lastStatus === 200,
    );
    check(
      (await api.changeMemberRole(owner.token, id, admin.user.id, "admin", {})).role === "admin",
    );
    check(
      (await api.addMember(owner.token, id, admin.user.id, {})).role === "admin" &&
        lastStatus === 200,
    );
    await code(
      () => api.addMember(member.token, id, outsider.user.id, {}),
      403,
      "conversation.insufficient_permissions",
    );
    await code(
      () =>
        client.request({
          method: "PATCH",
          path: ["conversations", id],
          body: { title: " " },
          accessToken: owner.token,
          expectedStatuses: [200],
          decode: () => undefined,
        }),
      422,
      "conversation.invalid_title",
    );
    await code(
      () =>
        client.request({
          method: "PATCH",
          path: ["conversations", id, "members", member.user.id],
          body: { role: "owner" },
          accessToken: owner.token,
          expectedStatuses: [200],
          decode: () => undefined,
        }),
      400,
      "request.invalid_json",
    );
    check((await api.renameGroup(admin.token, id, "Admin renamed", {})).title === "Admin renamed");
    await code(
      () => api.changeMemberRole(admin.token, id, owner.user.id, "member", {}),
      409,
      "conversation.owner_protected",
    );
    await code(
      () => api.removeMember(admin.token, id, owner.user.id, {}),
      409,
      "conversation.owner_protected",
    );
    await code(
      () => api.removeMember(owner.token, id, owner.user.id, {}),
      403,
      "conversation.insufficient_permissions",
    );
    await code(
      () => api.transferOwner(admin.token, id, member.user.id, {}),
      403,
      "conversation.insufficient_permissions",
    );
    check(
      (await api.changeMemberRole(admin.token, id, admin.user.id, "member", {})).role === "member",
    );
    await code(
      () => api.renameGroup(admin.token, id, "Denied now", {}),
      403,
      "conversation.insufficient_permissions",
    );
    check(
      (await api.changeMemberRole(owner.token, id, admin.user.id, "admin", {})).role === "admin",
    );
    const missing = "019a0000-0000-7000-8000-000000009999";
    await code(
      () => api.removeMember(owner.token, id, missing, {}),
      404,
      "conversation.member_not_found",
    );
    await code(
      () => api.transferOwner(owner.token, id, missing, {}),
      404,
      "conversation.member_not_found",
    );
    stage = "response-loss";
    dropNext = true;
    const before = writes.length;
    try {
      await api.renameGroup(owner.token, id, "Lost response", {});
      throw new Error("Expected response loss.");
    } catch (error) {
      check(error instanceof ApiError && error.category === "transport");
    }
    check(
      (await api.get(owner.token, id, {})).title === "Lost response" &&
        writes.length === before + 1,
    );
    stage = "ownership";
    check(
      (await api.transferOwner(owner.token, id, owner.user.id, {})).membership.role === "owner",
    );
    await code(
      () => api.leaveGroup(owner.token, id, {}),
      409,
      "conversation.ownership_transfer_required",
    );
    // Mutate only the private disposable database to exercise disabled existing membership.
    const db = new Database(database);
    try {
      db.query("UPDATE users SET disabled_at = ? WHERE id = ?").run(
        Date.now() * 1000,
        blob(member.user.id),
      );
    } finally {
      db.close();
    }
    check((await api.findExactUsername(owner.token, "member", {})) === null);
    check(
      (await api.addMember(owner.token, id, member.user.id, {})).role === "member" &&
        lastStatus === 200,
    );
    check(
      (await api.transferOwner(owner.token, id, member.user.id, {})).membership.role === "admin",
    );
    const roster = await api.listMembers(owner.token, id, undefined, {});
    check(
      roster.items.find((m) => m.user.id === member.user.id)?.role === "owner" &&
        roster.items.find((m) => m.user.id === owner.user.id)?.role === "admin",
    );
    await api.removeMember(owner.token, id, outsider.user.id, {});
    check(lastStatus === 204);
    await api.leaveGroup(owner.token, id, {});
    check(lastStatus === 204);
    await code(() => api.get(owner.token, id, {}), 404, "conversation.not_found");
    stage = "direct-protection";
    const direct = await api.openDirect(admin.token, outsider.user.id, crypto.randomUUID(), {});
    await code(
      () => api.renameGroup(admin.token, direct.id, "Denied", {}),
      409,
      "conversation.operation_not_supported",
    );
    await code(
      () => api.leaveGroup(admin.token, direct.id, {}),
      409,
      "conversation.operation_not_supported",
    );
    stage = "hard-deletion";
    const alone = await api.createGroup(
      outsider.token,
      { kind: "group", title: "Disposable history", participant_ids: [] },
      crypto.randomUUID(),
      {},
    );
    // Fixture-only history, not a client messaging feature.
    const fixtureDb = new Database(database);
    const first = blob("019a0000-0000-7000-8000-000000008001");
    const reply = blob("019a0000-0000-7000-8000-000000008002");
    try {
      const insert = fixtureDb.query(
        "INSERT INTO messages (id, conversation_id, sender_id, content, reply_to_message_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      );
      insert.run(
        first,
        blob(alone.id),
        blob(outsider.user.id),
        "disposable original",
        null,
        Date.now() * 1000,
      );
      insert.run(
        reply,
        blob(alone.id),
        blob(outsider.user.id),
        "disposable reply",
        first,
        Date.now() * 1000 + 1,
      );
      check(
        fixtureDb
          .query<{ n: number }, [Uint8Array]>(
            "SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ?",
          )
          .get(blob(alone.id))?.n === 2,
      );
    } finally {
      fixtureDb.close();
    }
    const probe = await api.probeGroupMembers(outsider.token, alone.id, {});
    check(probe.items.length === 1 && probe.items[0]!.role === "owner" && !probe.has_more);
    await api.leaveGroup(outsider.token, alone.id, {});
    check(lastStatus === 204);
    await code(() => api.get(outsider.token, alone.id, {}), 404, "conversation.not_found");
    const inspect = new Database(database, { readonly: true });
    try {
      const count = (sql: string) =>
        inspect.query<{ n: number }, [Uint8Array]>(sql).get(blob(alone.id))!.n;
      check(count("SELECT COUNT(*) AS n FROM conversations WHERE id = ?") === 0);
      check(
        count("SELECT COUNT(*) AS n FROM conversation_members WHERE conversation_id = ?") === 0,
      );
      check(count("SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ?") === 0);
    } finally {
      inspect.close();
    }
    check(writes.every((w) => !w.key));
    check(writes.filter((w) => w.method === "DELETE").every((w) => !w.body && !w.contentType));
    check(writes.filter((w) => w.method === "PUT" && !w.body).every((w) => !w.contentType));
    console.log(
      JSON.stringify({ source: PINNED_SOURCE, assertions, result: "passed", disposable: true }),
    );
  } finally {
    clearTimeout(timer);
    server.kill("SIGTERM");
    await server.exited;
    await drains.catch(() => {});
  }
} catch {
  console.error(JSON.stringify({ stage, result: "failed" }));
  process.exitCode = 1;
} finally {
  await rm(sandbox, { recursive: true });
}
