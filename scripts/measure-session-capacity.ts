import { mkdtemp, rm, writeFile, chmod } from "node:fs/promises";
import { resolve, join } from "node:path";
import { ApiClient } from "../src/shared/api/client";
import { AuthApi } from "../src/features/authentication/api";
import { measureSessionEnvelope } from "../src/features/authentication/capacity";
import { authFailure } from "../src/features/authentication/errors";

// Opt-in real-server gate. Tokens/passwords/key/config/DB never leave the temporary sandbox
// or process memory; stdout contains only booleans/counts and the source SHA.
const PINNED_SOURCE = "d83d5d9210ccd35b0c29f03ad678b42644c1d196";
const source = process.argv[2];
if (!source || process.argv.length !== 3) {
  console.error(
    "Usage: bun scripts/measure-session-capacity.ts /absolute/path/to/pinned/server/source",
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
  clean.stdout.toString().trim() !== ""
) {
  console.error("Capacity measurement requires the clean pinned Server 0.1.1 source.");
  process.exit(1);
}
// Compile exactly that checkout, sequentially and with no more than four Cargo jobs.
const built = Bun.spawn(
  ["cargo", "build", "--locked", "-p", "windwatcher-server", "--target-dir", join(root, "target")],
  {
    cwd: root,
    env: { ...process.env, CARGO_BUILD_JOBS: "4" },
    stdout: "ignore",
    stderr: "ignore",
  },
);
if ((await built.exited) !== 0) {
  console.error("Pinned server build failed; no capacity evidence collected.");
  process.exit(1);
}
const binary = join(
  root,
  "target",
  "debug",
  process.platform === "win32" ? "windwatcher.exe" : "windwatcher",
);
const sandbox = await mkdtemp("/tmp/opencode/windwatcher-auth-capacity-");
await chmod(sandbox, 0o700);
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("WINDWATCHER")),
);
Object.assign(env, {
  HOME: sandbox,
  XDG_CONFIG_HOME: sandbox,
  XDG_DATA_HOME: sandbox,
  XDG_STATE_HOME: sandbox,
});

let stage = "setup";
async function sample(name: string, issuer: string, registration: "open" | "closed") {
  stage = "isolated-config";
  const config = join(sandbox, `${name}.toml`);
  const key = join(sandbox, `${name}.key`);
  await writeFile(key, crypto.getRandomValues(new Uint8Array(64)), { mode: 0o600 });
  await writeFile(
    config,
    `
[storage]
provider = "sqlite"
[storage.sqlite]
url = ${JSON.stringify(join(sandbox, `${name}.db`))}
create_if_missing = true
[auth]
registration = ${JSON.stringify(registration)}
[auth.jwt]
issuer = ${JSON.stringify(issuer)}
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
  stage = "isolated-migration";
  const migration = Bun.spawn([binary, "--config", config, "migrate", "--storage"], {
    cwd: sandbox,
    env,
    stdout: "ignore",
    stderr: "ignore",
  });
  if ((await migration.exited) !== 0) throw new Error("Isolated migration failed.");
  stage = "server-startup";
  const server = Bun.spawn([binary, "--config", config, "serve"], {
    cwd: sandbox,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  let acceptAddress: (address: string) => void = () => {};
  const address = new Promise<string>((accept) => {
    acceptAddress = accept;
  });
  async function consume(stream: ReadableStream<Uint8Array>) {
    let pending = "";
    const decoder = new TextDecoder();
    for await (const chunk of stream) {
      pending += decoder.decode(chunk, { stream: true });
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      if (pending.length > 8192) throw new Error("Unexpected server diagnostic size.");
      for (const line of lines) {
        // Inspect only a safe startup event, never forward diagnostics to console.
        if (!line.includes("server_listening")) continue;
        const record: unknown = JSON.parse(line);
        if (
          record &&
          typeof record === "object" &&
          "fields" in record &&
          record.fields &&
          typeof record.fields === "object" &&
          "bind" in record.fields &&
          typeof record.fields.bind === "string" &&
          /^127\.0\.0\.1:\d+$/.test(record.fields.bind)
        )
          acceptAddress(record.fields.bind);
      }
    }
  }
  const drains = [consume(server.stdout), consume(server.stderr)];
  const output = Promise.all(drains);
  // Observe failure immediately even after readiness, but never forward raw diagnostics.
  void output.catch(() => {});
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    const bound = await Promise.race([
      address,
      output.then(() => {
        throw new Error("Isolated server diagnostics ended before listening.");
      }),
      server.exited.then(() => {
        throw new Error("Isolated server exited before listening.");
      }),
      new Promise<never>((_, reject) => {
        deadline = setTimeout(
          () => reject(new Error("Isolated server startup timed out.")),
          20_000,
        );
      }),
    ]);
    stage = "api-binding";
    const client = new ApiClient({
      baseUrl: `http://${bound}/`,
      transport: (url, request) =>
        fetch(url, {
          ...request,
          credentials: "omit",
          redirect: "manual",
        }),
    });
    const api = new AuthApi(client);
    const password = `isolated-${crypto.randomUUID()}`;
    if (registration === "closed") {
      try {
        await api.register("capacity_fixture", password);
        throw new Error("Closed registration unexpectedly succeeded.");
      } catch (error) {
        if (authFailure(error) !== "registration-closed")
          throw new Error("Closed registration contract failed.", { cause: error });
      }
      return { sample: name, registrationClosed: true };
    }
    stage = "registration";
    const identity = await api.register("capacity_fixture", password);
    stage = "login";
    const grant = await api.login("capacity_fixture", password);
    stage = "current-user";
    const current = await api.currentUser(grant.access_token);
    if (current.id !== identity.id || current.disabled_at)
      throw new Error("Current-user binding failed.");
    const binding = {
      accountId: crypto.randomUUID(),
      profileId: crypto.randomUUID(),
      userId: current.id,
      operationId: crypto.randomUUID(),
      generation: Number.MAX_SAFE_INTEGER,
    };
    stage = "envelope-measurement";
    const loginSize = measureSessionEnvelope(grant, binding);
    stage = "refresh";
    const rotated = await api.refresh(grant.refresh_token);
    stage = "refresh-binding";
    if (
      rotated.session_id !== grant.session_id ||
      Date.parse(rotated.session_expires_at) !== Date.parse(grant.session_expires_at)
    )
      throw new Error("Refresh session binding failed.");
    stage = "consumed-refresh";
    try {
      await api.refresh(grant.refresh_token);
      throw new Error("Consumed refresh token unexpectedly succeeded.");
    } catch (error) {
      if (authFailure(error) !== "invalid-refresh")
        throw new Error("Refresh one-use contract failed.", { cause: error });
    }
    stage = "rotated-current-user";
    const refreshed = await api.currentUser(rotated.access_token);
    if (refreshed.id !== identity.id) throw new Error("Rotated current-user binding failed.");
    stage = "revoke";
    await client.request({
      method: "DELETE",
      path: ["sessions", "current"],
      expectedStatuses: [204],
      response: "empty",
      accessToken: rotated.access_token,
    });
    stage = "revoked-refresh";
    try {
      await api.refresh(rotated.refresh_token);
      throw new Error("Revoked refresh token unexpectedly succeeded.");
    } catch (error) {
      if (authFailure(error) !== "invalid-refresh")
        throw new Error("Revoked refresh contract failed.", { cause: error });
    }
    return {
      sample: name,
      issuerBytes: new TextEncoder().encode(issuer).byteLength,
      login: loginSize,
      refresh: measureSessionEnvelope(rotated, binding),
      identityConfirmed: true,
      rotationConfirmed: true,
      consumedRefreshRejected: true,
      revokedRefreshRejected: true,
      windowsRuntimeTested: false,
    };
  } finally {
    clearTimeout(deadline);
    server.kill("SIGTERM");
    await server.exited;
    await output;
  }
}

try {
  const results = [];
  for (const [name, issuer, registration] of [
    ["default", "windwatcher", "open"],
    ["long-issuer", `https://identity.example.test/${"a".repeat(483)}`, "open"],
    ["longer-issuer", `https://identity.example.test/${"a".repeat(2019)}`, "open"],
    ["closed", "windwatcher", "closed"],
  ] as const) {
    // oxlint-disable-next-line no-await-in-loop -- Isolated native processes must run sequentially.
    results.push(await sample(name, issuer, registration));
  }
  const windowsDpapiByteBudgetPassed = results.every(
    (result) =>
      !("login" in result) ||
      result.login === undefined ||
      (result.login.fitsWindowsDpapiByteBudget && result.refresh.fitsWindowsDpapiByteBudget),
  );
  console.log(
    JSON.stringify({ sourceCommit: PINNED_SOURCE, windowsDpapiByteBudgetPassed, results }, null, 2),
  );
  if (!windowsDpapiByteBudgetPassed) process.exitCode = 2;
} catch (error) {
  console.error(
    `Isolated authentication capacity gate failed (${stage}, ${authFailure(error)}); raw diagnostics and credentials suppressed.`,
  );
  process.exitCode = 1;
} finally {
  // Delete only the exact directory created by this invocation, never operator data.
  await rm(sandbox, { recursive: true, force: true });
}
