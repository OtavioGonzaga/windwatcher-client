import { expect, test } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { grant, user } from "../fixtures/authentication";
import { problem } from "../fixtures/instance";
import { resources } from "../../src/shared/i18n";

const id = (n: number) => `019a0000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;
const date = "2026-11-06T12:00:00Z";
type Role = "owner" | "admin" | "member";
type Member = { user: { id: string; username: string }; role: Role; joined_at: string };
type Group = { id: string; title: string; role: Role; members: Member[]; host: string };
type Mode =
  | "normal"
  | "drop"
  | "rate"
  | "invalid-title"
  | "participant"
  | "conflict"
  | "result"
  | "wrong-kind"
  | "unauthorized"
  | "server-error"
  | "hold-post"
  | "hold-lookup"
  | "hold-members"
  | "invalid-cursor"
  | "repeated-cursor"
  | "missing"
  | "direct-role";
type LifecycleMode =
  | "drop-write"
  | "hold-write"
  | "rate-write"
  | "permission-write"
  | "refresh-failure";
type Call = {
  host: string;
  path: string;
  query: string;
  method: string;
  token: string;
  key: string;
  body: unknown;
};

async function fixture(context: BrowserContext) {
  let mode: Mode | LifecycleMode = "normal";
  let release: (() => void) | undefined;
  let began: (() => void) | undefined;
  let ended: (() => void) | undefined;
  let started = Promise.resolve();
  let finished = Promise.resolve();
  const groups = new Map<string, Group>();
  const leftGroups = new Set<string>();
  const keys = new Map<string, { fingerprint: string; id: string }>();
  const calls: Call[] = [];
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type, idempotency-key",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  };
  const dto = (g: Group) => ({
    id: g.id,
    title: g.title,
    kind: "group",
    membership: { role: g.role },
    unread_count: 0,
    created_at: date,
    updated_at: date,
    last_message: null,
  });
  const peer = (name: string, host: string) => ({
    id:
      name === "alice"
        ? user.id
        : id((host.startsWith("two.") ? 500 : 0) + (name === "bob" ? 3 : 4)),
    username: name,
  });
  await context.route("https://*.groups.test/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    const token = req.headers().authorization ?? "";
    const body: unknown = req.postData() ? req.postDataJSON() : undefined;
    calls.push({
      host: url.host,
      path: url.pathname,
      query: url.search,
      method: req.method(),
      token,
      key: req.headers()["idempotency-key"] ?? "",
      body,
    });
    const fail = (status: number, code: string) =>
      route.fulfill({
        status,
        headers: { ...headers, "Content-Type": "application/problem+json", "Retry-After": "1" },
        json: problem(status, code),
      });
    if (url.pathname.endsWith("/sessions/current")) return route.fulfill({ status: 204, headers });
    if (url.pathname.endsWith("/instance"))
      return route.fulfill({
        headers,
        json: {
          service: "windwatcher",
          api_versions: ["v1"],
          auth_methods: ["password"],
          registration: "open",
        },
      });
    if (url.pathname.endsWith("/sessions"))
      return route.fulfill({
        status: 201,
        headers,
        json: {
          ...grant,
          access_token: `fixture.${url.host.startsWith("two.") ? "two" : "one"}.signature`,
          access_token_expires_at: new Date(Date.now() + 600_000).toISOString(),
          session_expires_at: new Date(Date.now() + 86400_000).toISOString(),
        },
      });
    if (url.pathname.endsWith("/users/me")) return route.fulfill({ headers, json: user });
    const held =
      (mode === "hold-post" && req.method() === "POST") ||
      (mode === "hold-lookup" && url.pathname.endsWith("/users")) ||
      (mode === "hold-members" && url.pathname.endsWith("/members")) ||
      (mode === "hold-write" && ["PUT", "PATCH", "DELETE"].includes(req.method()));
    if (held) {
      mode = "normal";
      began?.();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    }
    try {
      if (url.pathname.endsWith("/users")) {
        const name = url.searchParams.get("username")?.toLowerCase();
        return await route.fulfill({
          headers,
          json: {
            items: name && ["alice", "bob", "carol"].includes(name) ? [peer(name, url.host)] : [],
            has_more: false,
          },
        });
      }
      if (url.pathname.endsWith("/conversations") && req.method() === "POST") {
        const next = mode;
        mode = "normal";
        if (next === "rate") return await fail(429, "rate_limit.exceeded");
        if (next === "invalid-title") return await fail(422, "conversation.invalid_title");
        if (next === "participant") return await fail(422, "conversation.participant_unavailable");
        if (next === "conflict") return await fail(409, "idempotency.key_reused");
        if (next === "result") return await fail(409, "idempotency.result_unavailable");
        if (next === "unauthorized") return await fail(401, "auth.invalid_access_token");
        if (next === "server-error") return await fail(500, "internal.error");
        if (next === "wrong-kind")
          return await route.fulfill({
            headers,
            json: {
              id: id(900),
              kind: "direct",
              title: "wrong",
              membership: { role: "direct" },
              unread_count: 0,
              created_at: date,
              updated_at: date,
            },
          });
        if (
          typeof body !== "object" ||
          body === null ||
          !("kind" in body) ||
          body.kind !== "group" ||
          !("title" in body) ||
          typeof body.title !== "string" ||
          !("participant_ids" in body) ||
          !Array.isArray(body.participant_ids)
        )
          throw new Error("Invalid fixture Group request.");
        const participants: string[] = [];
        for (const value of body.participant_ids) {
          if (typeof value !== "string") throw new Error("Invalid participant.");
          participants.push(value);
        }
        if (
          new TextEncoder().encode(body.title).byteLength > 256 ||
          /^\p{White_Space}*$/u.test(body.title)
        )
          return await fail(422, "conversation.invalid_title");
        if (participants.length > 256) return await fail(422, "conversation.too_many_participants");
        const normalized = [...new Set(participants)].filter((p) => p !== user.id).sort();
        const fingerprint = JSON.stringify([body.title, normalized]);
        const key = `${url.host}:${user.id}:${req.headers()["idempotency-key"]}`;
        const existing = keys.get(key);
        if (existing) {
          if (existing.fingerprint !== fingerprint)
            return await fail(409, "idempotency.key_reused");
          const original = groups.get(existing.id);
          if (!original) return await fail(409, "idempotency.result_unavailable");
          return await route.fulfill({
            headers: { ...headers, "Idempotency-Replayed": "true" },
            json: dto(original),
          });
        }
        const g: Group = {
          id: id(1000 + groups.size),
          title: body.title,
          role: "owner",
          host: url.host,
          members: [
            { user: { id: user.id, username: "alice" }, role: "owner", joined_at: date },
            ...normalized.map((participant): Member => ({
              user: {
                id: participant,
                username: participant === peer("bob", url.host).id ? "bob" : "carol",
              },
              role: "member",
              joined_at: date,
            })),
          ],
        };
        groups.set(g.id, g);
        keys.set(key, { id: g.id, fingerprint }); // No uniqueness-by-title map.
        if (next === "drop") return await route.abort("failed");
        return await route.fulfill({ status: 201, headers, json: dto(g) });
      }
      if (url.pathname.endsWith("/conversations"))
        return await route.fulfill({
          headers,
          json: {
            items: [...groups.values()].filter((g) => g.host === url.host).map(dto),
            has_more: false,
          },
        });
      const cid = url.pathname.split("/")[4];
      const g = groups.get(cid ?? "");
      if (!g || g.host !== url.host || mode === "missing" || leftGroups.has(g.id))
        return await fail(404, "conversation.not_found");
      if (req.method() === "GET" && mode === "refresh-failure") {
        mode = "normal";
        return await fail(500, "internal.error");
      }
      if (["PUT", "PATCH", "DELETE"].includes(req.method())) {
        const next = mode;
        mode = "normal";
        if (next === "rate-write") return await fail(429, "rate_limit.exceeded");
        if (next === "permission-write") {
          g.role = "member";
          const own = g.members.find((m) => m.user.id === user.id);
          if (own) own.role = "member";
          return await fail(403, "conversation.insufficient_permissions");
        }
        const suffix = url.pathname.split("/").slice(5);
        const targetId = suffix[1];
        const targetMember = g.members.find((m) => m.user.id === targetId);
        let result: unknown;
        let status = 200;
        if (suffix.join("/") === "members/me") {
          if (g.role === "owner" && g.members.length > 1)
            return await fail(409, "conversation.ownership_transfer_required");
          g.members = g.members.filter((m) => m.user.id !== user.id);
          leftGroups.add(g.id);
          if (!g.members.length) groups.delete(g.id);
          status = 204;
        } else {
          if (g.role === "member") return await fail(403, "conversation.insufficient_permissions");
          if (!suffix.length && req.method() === "PATCH") {
            if (
              typeof body !== "object" ||
              body === null ||
              !("title" in body) ||
              typeof body.title !== "string"
            )
              throw new Error("Invalid rename fixture request.");
            g.title = body.title;
            result = dto(g);
          } else if (suffix[0] === "owner") {
            if (g.role !== "owner") return await fail(403, "conversation.insufficient_permissions");
            if (typeof body !== "object" || body === null || !("user_id" in body))
              throw new Error("Invalid transfer fixture request.");
            const targetOwner = g.members.find((m) => m.user.id === body.user_id);
            if (!targetOwner) return await fail(404, "conversation.member_not_found");
            if (targetOwner.user.id !== user.id) {
              const old = g.members.find((m) => m.user.id === user.id);
              if (old) old.role = "admin";
              targetOwner.role = "owner";
              g.role = "admin";
            }
            result = dto(g);
          } else if (req.method() === "PUT") {
            if (targetMember) result = targetMember;
            else {
              const found = ["bob", "carol", "alice"]
                .map((name) => peer(name, url.host))
                .find((p) => p.id === targetId);
              if (!found) return await fail(422, "conversation.participant_unavailable");
              const added: Member = { user: found, role: "member", joined_at: date };
              g.members.push(added);
              result = added;
              status = 201;
            }
          } else {
            if (!targetMember) return await fail(404, "conversation.member_not_found");
            if (req.method() === "DELETE" && targetId === user.id)
              return await fail(403, "conversation.insufficient_permissions");
            if (targetMember.role === "owner")
              return await fail(409, "conversation.owner_protected");
            if (req.method() === "DELETE") {
              g.members = g.members.filter((m) => m.user.id !== targetId);
              status = 204;
            } else {
              if (
                typeof body !== "object" ||
                body === null ||
                !("role" in body) ||
                (body.role !== "admin" && body.role !== "member")
              )
                return await fail(400, "request.invalid_json");
              targetMember.role = body.role;
              if (targetId === user.id) g.role = body.role;
              result = targetMember;
            }
          }
        }
        if (next === "drop-write") return await route.abort("failed");
        return await route.fulfill({
          status,
          headers,
          ...(status === 204 ? {} : { json: result }),
        });
      }
      if (url.pathname.endsWith("/members")) {
        if (mode === "invalid-cursor") {
          mode = "normal";
          return await fail(400, "pagination.invalid_cursor");
        }
        const cursor = url.searchParams.get("cursor");
        if (cursor && !/^opaque-\d+$/.test(cursor))
          return await fail(400, "pagination.invalid_cursor");
        const offset = cursor ? Number(cursor.replace("opaque-", "")) : 0;
        const limit = Number(url.searchParams.get("limit") ?? 50);
        const rows = g.members.slice(offset, offset + limit);
        const more = offset + limit < g.members.length;
        const repeat = mode === "repeated-cursor";
        const badRole = mode === "direct-role";
        mode = "normal";
        return await route.fulfill({
          headers,
          json: {
            items: badRole ? rows.map((m) => ({ ...m, role: "direct" })) : rows,
            has_more: repeat || more,
            ...(repeat || more
              ? { next_cursor: repeat ? cursor : `opaque-${offset + limit}` }
              : {}),
          },
        });
      }
      return await route.fulfill({ headers, json: dto(g) });
    } catch {
      if (!held) throw new Error("Unexpected Group fixture failure.");
    } finally {
      if (held) ended?.();
    }
  });
  return {
    groups,
    calls,
    posts: () => calls.filter((c) => c.path.endsWith("/conversations") && c.method === "POST"),
    mode: (next: Mode | LifecycleMode) => {
      mode = next;
      if (next.startsWith("hold-")) {
        started = new Promise<void>((resolve) => {
          began = resolve;
        });
        finished = new Promise<void>((resolve) => {
          ended = resolve;
        });
      }
    },
    started: () => started,
    finished: () => finished,
    release: () => release?.(),
  };
}

async function login(page: Page, host = "one") {
  await page.goto("/#/connect");
  await page.getByLabel("Server URL").fill(`https://${host}.groups.test/proxy/`);
  await page.getByRole("button", { name: "Check server", exact: true }).click();
  await page.getByRole("button", { name: "Save server", exact: true }).click();
  await page.goto("/#/servers");
  await page
    .getByRole("link", { name: `Sign in https://${host}.groups.test/proxy/`, exact: true })
    .click();
  await page.getByLabel("Username").fill("alice");
  await page.getByLabel("Password", { exact: true }).fill("synthetic password");
  await page.getByRole("button", { name: "Sign in and save session" }).click();
  await expect(page.getByText("Signed in as alice", { exact: true })).toBeVisible();
}
async function draft(page: Page, title = "  Engineering 😀  ") {
  await page.goto("/#/conversations/groups/new");
  await page.getByLabel("Group title", { exact: true }).fill(title);
}
async function add(page: Page, name: string) {
  await page.getByLabel("Full username").fill(name);
  await page.getByRole("button", { name: "Find and add participant" }).click();
}
async function create(page: Page) {
  await page.getByRole("button", { name: "Review group", exact: true }).click();
  await page.getByRole("button", { name: "Create group", exact: true }).click();
}

async function openGroupInfo(page: Page, label = "Group information") {
  await page.getByText(label, { exact: true }).click();
}

async function managedGroup(page: Page, context: BrowserContext) {
  const f = await fixture(context);
  await login(page);
  await draft(page, "Managed group");
  await add(page, "bob");
  await expect(page.getByRole("button", { name: "Remove bob", exact: true })).toBeVisible();
  await create(page);
  await openGroupInfo(page);
  await expect(page.getByRole("button", { name: "Save title" })).toBeEnabled();
  await expect(
    page.getByRole("region", { name: "Members", exact: true }).getByRole("listitem"),
  ).toHaveCount(2);
  return f;
}
async function confirmManagement(page: Page, label = "Confirm action") {
  await page.getByRole("dialog").getByRole("button", { name: label, exact: true }).click();
}
const lifecycleWrites = (calls: Call[]) =>
  calls.filter(
    (c) => c.path.includes("/conversations/") && ["PATCH", "PUT", "DELETE"].includes(c.method),
  );

for (const action of ["rename", "add", "role", "remove", "transfer", "leave"] as const) {
  test(`lifecycle ${action}: committed lost response requires read reconciliation, never replay`, async ({
    page,
    context,
  }) => {
    const f = await managedGroup(page, context);
    const g = [...f.groups.values()][0]!;
    if (action === "leave") {
      g.role = "member";
      g.members.forEach((m) => {
        m.role = m.user.id === user.id ? "member" : "owner";
      });
      await page.getByRole("button", { name: "Refresh members" }).click();
      await expect(page.getByRole("button", { name: "Save title" })).toHaveCount(0);
    }
    if (action === "rename") {
      await page.getByLabel("Group title", { exact: true }).fill(" exact 😀 ");
      await page.getByRole("button", { name: "Save title" }).click();
    } else if (action === "add") {
      await page.getByLabel("Full username").fill("CAROL");
      await page.getByRole("button", { name: "Find user", exact: true }).click();
      await page.getByRole("button", { name: "Review member addition" }).click();
    } else if (action === "role")
      await page.getByRole("button", { name: "Promote bob to Admin" }).click();
    else if (action === "remove")
      await page.getByRole("button", { name: "Remove bob from group" }).click();
    else if (action === "transfer")
      await page.getByRole("button", { name: "Transfer ownership to bob" }).click();
    else await page.getByRole("button", { name: "Review leaving group" }).click();
    f.mode("drop-write");
    await confirmManagement(page);
    await expect(page.getByText(/This change may already have happened/)).toBeVisible();
    expect(lifecycleWrites(f.calls)).toHaveLength(1);
    await page.getByRole("button", { name: "Check current state" }).click();
    if (action === "leave") {
      await expect(page.getByText("This conversation is unavailable.")).toBeVisible();
      await expect(page.getByRole("region", { name: "Members", exact: true })).toHaveCount(0);
    } else {
      await expect(
        page.getByText("Current server state matches the requested change."),
      ).toBeVisible();
      await expect(page.getByText(/This change may already have happened/)).toBeVisible();
      await page.getByRole("button", { name: "Acknowledge uncertainty and continue" }).click();
      if (action === "transfer")
        await expect(page.getByRole("button", { name: /Transfer ownership to/ })).toHaveCount(0);
    }
    const writes = lifecycleWrites(f.calls);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.key).toBe("");
    expect(writes[0]?.token).toBe("Bearer fixture.one.signature");
    const expected = {
      rename: ["PATCH", { title: " exact 😀 " }],
      add: ["PUT", undefined],
      role: ["PATCH", { role: "admin" }],
      remove: ["DELETE", undefined],
      transfer: ["PUT", { user_id: id(3) }],
      leave: ["DELETE", undefined],
    }[action];
    expect([writes[0]?.method, writes[0]?.body]).toEqual(expected);
  });
}

test("lifecycle permission loss retains readable Group and drops stale controls", async ({
  page,
  context,
}) => {
  const f = await managedGroup(page, context);
  await page.getByRole("button", { name: "Save title" }).click();
  f.mode("permission-write");
  await confirmManagement(page);
  await expect(page.getByText(/Management permissions changed/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Managed group", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Members", exact: true })).toContainText("alice");
  await expect(page.getByRole("button", { name: "Save title" })).toHaveCount(0);
  expect(lifecycleWrites(f.calls)).toHaveLength(1);
});

test("lifecycle Owner transfer and Admin self-demotion revalidate own controls", async ({
  page,
  context,
}) => {
  const f = await managedGroup(page, context);
  await page.getByRole("button", { name: "Transfer ownership to alice" }).click();
  await expect(page.getByRole("dialog")).toContainText("You remain Owner.");
  await confirmManagement(page);
  await page.getByRole("button", { name: "Continue with current state" }).click();
  await page.getByRole("button", { name: "Transfer ownership to bob" }).click();
  await expect(page.getByRole("dialog")).toContainText("you become Admin");
  await confirmManagement(page);
  await page.getByRole("button", { name: "Continue with current state" }).click();
  await page.getByRole("button", { name: "Demote alice to Member" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "You will lose Group management permissions.",
  );
  await confirmManagement(page);
  await expect(page.getByRole("button", { name: "Save title" })).toHaveCount(0);
  expect(lifecycleWrites(f.calls)).toHaveLength(3);
});

test("lifecycle Owner-only deletion preflight handles a concurrent addition", async ({
  page,
  context,
}) => {
  const f = await fixture(context);
  await login(page);
  await draft(page, "Disposable");
  await create(page);
  await openGroupInfo(page);
  const leave = page.getByRole("button", { name: "Review leaving group" });
  await expect(leave).toBeEnabled();
  await leave.click();
  await expect(page.getByRole("dialog")).toContainText("all messages and reply-linked history");
  expect(f.calls.filter((c) => c.path.endsWith("/members")).at(-1)?.query).toBe("?limit=2");
  const g = [...f.groups.values()][0]!;
  g.members.push({ user: { id: id(3), username: "bob" }, role: "member", joined_at: date });
  await confirmManagement(page, "Delete group by leaving");
  await expect(
    page.getByText("Transfer ownership before leaving a Group with other members."),
  ).toBeVisible();
  expect(f.groups.size).toBe(1);
  await page.getByRole("button", { name: "Continue with current state" }).click();
  g.members = g.members.filter((m) => m.user.id === user.id);
  await leave.click();
  await confirmManagement(page, "Delete group by leaving");
  await expect(page).toHaveURL(/#\/conversations$/);
  expect(f.groups.size).toBe(0);
  await expect(page.getByText("Disposable", { exact: true })).toHaveCount(0);
});

for (const locale of ["en", "pt-BR", "es", "de"] as const) {
  test(`${locale}: lifecycle confirmation and cancellation accessible at 320px`, async ({
    page,
    context,
  }) => {
    await managedGroup(page, context);
    await page.goto("/#/preferences");
    await page.locator("select").first().selectOption(locale);
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(`/#/conversations/${id(1000)}`);
    const labels = resources[locale].common;
    await openGroupInfo(page, labels.groups.info);
    const save = page.getByRole("button", { name: labels.groupManagement.rename, exact: true });
    await save.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(save).toBeFocused();
  });
}

test("lifecycle cooldown never schedules a write and requires a fresh confirmation", async ({
  page,
  context,
}) => {
  const f = await managedGroup(page, context);
  await page.getByRole("button", { name: "Save title" }).click();
  f.mode("rate-write");
  await confirmManagement(page);
  const check = page.getByRole("button", { name: "Check current state" });
  await expect(check).toBeDisabled();
  await expect(check).toBeEnabled();
  expect(lifecycleWrites(f.calls)).toHaveLength(1);
  await check.click();
  await page.getByRole("button", { name: "Continue with current state" }).click();
  await page.getByRole("button", { name: "Save title" }).click();
  expect(lifecycleWrites(f.calls)).toHaveLength(1);
  await confirmManagement(page);
  await expect(page.getByText(/The server confirmed this request/)).toBeVisible();
  expect(lifecycleWrites(f.calls)).toHaveLength(2);
});

test("lifecycle server switch fences a late held write", async ({ page, context }) => {
  const f = await managedGroup(page, context);
  await login(page, "two");
  await draft(page, "Other server");
  await create(page);
  await openGroupInfo(page);
  await expect(page.getByRole("button", { name: "Save title" })).toBeEnabled();
  await page.getByRole("button", { name: "Save title" }).click();
  f.mode("hold-write");
  await confirmManagement(page);
  await f.started();
  await page.getByRole("button", { name: /^Accounts and servers/ }).click();
  await page
    .getByRole("button", { name: "Switch to alice on https://one.groups.test/proxy/", exact: true })
    .click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  f.release();
  await f.finished();
  await expect(page.getByText(/The server confirmed this request/)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Other server", exact: true })).toHaveCount(0);
  const first = [...f.groups.values()].find((g) => g.host === "one.groups.test")!;
  await page.goto(`/#/conversations/${first.id}`);
  await openGroupInfo(page);
  await page.getByRole("button", { name: "Save title" }).click();
  await confirmManagement(page);
  await expect(page.getByText(/The server confirmed this request/)).toBeVisible();
  expect(lifecycleWrites(f.calls).map((c) => [c.host, c.token])).toEqual([
    ["two.groups.test", "Bearer fixture.two.signature"],
    ["one.groups.test", "Bearer fixture.one.signature"],
  ]);
});

for (const action of ["Log out", "Remove saved account", "forget", "reauthenticate"] as const) {
  test(`lifecycle ${action}: cross-tab cleanup waits for the sent write`, async ({
    page,
    context,
  }) => {
    const f = await managedGroup(page, context);
    const writer = await context.newPage();
    await writer.goto(page.url());
    await openGroupInfo(writer);
    await writer.getByRole("button", { name: "Save title" }).click();
    f.mode("hold-write");
    await confirmManagement(writer);
    await f.started();
    if (action === "forget") {
      await page.goto("/#/servers");
      await page
        .getByRole("button", { name: "Forget server https://one.groups.test/proxy/", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Confirm forget https://one.groups.test/proxy/", exact: true })
        .click();
    } else if (action === "reauthenticate") {
      await page.goto("/#/servers");
      await page
        .getByRole("link", { name: "Sign in https://one.groups.test/proxy/", exact: true })
        .click();
      await page.getByLabel("Username").fill("alice");
      await page.getByLabel("Password", { exact: true }).fill("synthetic password");
      await page.getByRole("button", { name: "Sign in and save session" }).click();
    } else {
      await page.goto("/#/servers");
      await page.getByRole("button", { name: /^Accounts and servers/ }).click();
      await page
        .getByRole("button", {
          name: `${action} alice on https://one.groups.test/proxy/`,
          exact: true,
        })
        .click();
      await page.getByRole("button", { name: "Confirm", exact: true }).click();
    }
    await expect
      .poll(() =>
        page.evaluate(
          async () =>
            (await navigator.locks.query()).pending?.filter((lock) =>
              lock.name?.includes(":operation:profile-"),
            ).length ?? 0,
        ),
      )
      .toBe(1);
    f.release();
    await f.finished();
    if (action === "reauthenticate")
      await expect(page.getByText("Signed in as alice", { exact: true })).toBeVisible();
    else
      await expect(writer.getByText("Select a signed-in account to see its inbox.")).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          async () =>
            (await navigator.locks.query()).held?.filter((lock) =>
              lock.name?.includes(":operation:profile-"),
            ).length ?? 0,
        ),
      )
      .toBe(0);
    expect(lifecycleWrites(f.calls)).toHaveLength(1);
    await writer.close();
  });
}

test("owner-only and populated Group creation preserve title and fetch authoritative membership", async ({
  page,
  context,
}) => {
  const f = await fixture(context);
  await login(page);
  await page.getByRole("link", { name: "Inbox", exact: true }).click();
  await page.getByText("New conversation", { exact: true }).click();
  await page.getByRole("link", { name: "New group", exact: true }).click();
  await page.getByLabel("Group title", { exact: true }).fill("Owner only");
  await expect(page.getByText("Only you will join this Group as Owner.")).toBeVisible();
  await create(page);
  await openGroupInfo(page);
  await expect(page.getByRole("region", { name: "Members", exact: true })).toContainText("alice");
  expect(f.posts()[0]?.body).toEqual({ kind: "group", title: "Owner only", participant_ids: [] });
  await draft(page);
  await add(page, "ALICE");
  await expect(page.getByText("Already included as Owner.")).toBeVisible();
  await add(page, "BOB");
  await expect(page.getByText("Participant added as Member.")).toBeVisible();
  await add(page, "bob");
  await expect(page.getByText("Already added.", { exact: true })).toBeVisible();
  await add(page, "carol");
  await expect(page.getByRole("button", { name: "Remove carol" })).toBeVisible();
  expect(f.posts()).toHaveLength(1);
  await create(page);
  await expect(page.getByRole("heading", { name: "Engineering 😀", exact: true })).toBeVisible();
  await openGroupInfo(page);
  const members = page.getByRole("region", { name: "Members", exact: true });
  await expect(members.getByRole("listitem")).toHaveCount(3);
  await expect(members).toContainText("Member");
  expect(f.posts()[1]?.body).toEqual({
    kind: "group",
    title: "  Engineering 😀  ",
    participant_ids: [id(3), id(4)],
  });
  expect(
    f.calls.filter((c) => c.path.endsWith("/members")).every((c) => c.query === "?limit=50"),
  ).toBe(true);
});

test("missing and disabled lookup look alike, invalid username/title never dispatch", async ({
  page,
  context,
}) => {
  const f = await fixture(context);
  await login(page);
  await draft(page, " ");
  await add(page, "missing");
  await expect(page.getByText("No matching user could be found on this server.")).toBeVisible();
  await add(page, "disabled");
  await expect(page.getByText("No matching user could be found on this server.")).toBeVisible();
  const before = f.calls.filter((c) => c.path.endsWith("/users")).length;
  await add(page, " not valid ");
  await expect(page.getByText(/Enter 3–32 ASCII/)).toBeVisible();
  expect(f.calls.filter((c) => c.path.endsWith("/users"))).toHaveLength(before);
  await page.getByRole("button", { name: "Review group", exact: true }).click();
  await expect(page.getByText("Enter a nonblank title.")).toBeVisible();
  expect(f.posts()).toHaveLength(0);
});

for (const mode of ["direct-role", "repeated-cursor"] as const) {
  test(`${mode}: malformed Group member response requires a first-page restart`, async ({
    page,
    context,
  }) => {
    const f = await fixture(context);
    await login(page);
    await draft(page);
    await create(page);
    await openGroupInfo(page);
    const panel = page.getByRole("region", { name: "Members", exact: true });
    await expect(panel.getByText("alice", { exact: true })).toBeVisible();
    const g = [...f.groups.values()][0]!;
    g.members = Array.from({ length: 51 }, (_, n) => ({
      user: { id: id(n + 2000), username: `member_${n}` },
      role: n === 0 ? "owner" : "member",
      joined_at: date,
    }));
    await panel.getByRole("button", { name: "Refresh members" }).click();
    await expect(panel.getByRole("listitem")).toHaveCount(50);
    f.mode(mode);
    await panel.getByRole("button", { name: "Load more members" }).click();
    await panel.getByRole("button", { name: "Restart member list" }).click();
    await expect(panel.getByRole("listitem")).toHaveCount(50);
    expect(f.calls.filter((c) => c.path.endsWith("/members")).at(-1)?.query).toBe("?limit=50");
  });
}

test("committed response loss retries same operation and accepts renamed Group/current role", async ({
  page,
  context,
}) => {
  const f = await fixture(context);
  await login(page);
  await draft(page);
  f.mode("drop");
  await create(page);
  await expect(page.getByText(/The Group may already exist/)).toBeVisible();
  expect(f.groups.size).toBe(1);
  expect(f.posts()).toHaveLength(1);
  const group = [...f.groups.values()][0]!;
  group.title = "Renamed on server";
  group.role = "admin";
  group.members[0]!.role = "admin";
  group.members.push({ user: { id: id(3), username: "bob" }, role: "owner", joined_at: date });
  await page.getByRole("button", { name: "Retry same operation" }).click();
  await expect(page.getByRole("heading", { name: "Renamed on server" })).toBeVisible();
  expect(f.posts()[0]).toEqual(f.posts()[1]);
  expect(f.groups.size).toBe(1);
});

test("abandoning uncertainty requires acknowledgement; equal titles are not unique", async ({
  page,
  context,
}) => {
  const f = await fixture(context);
  await login(page);
  await draft(page);
  f.mode("drop");
  await create(page);
  await expect(page.getByText(/The Group may already exist/)).toBeVisible();
  await page.getByRole("button", { name: "Discard uncertain attempt" }).click();
  await expect(page.getByLabel("Group title", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Acknowledge risk and edit" }).click();
  await expect(page.getByLabel("Group title", { exact: true })).toBeFocused();
  await create(page);
  await openGroupInfo(page);
  await expect(
    page.getByRole("region", { name: "Members", exact: true }).getByText("alice", { exact: true }),
  ).toBeVisible();
  expect(f.groups.size).toBe(2);
  expect(f.posts()[0]?.key).not.toBe(f.posts()[1]?.key);
});

for (const mode of [
  "rate",
  "conflict",
  "result",
  "participant",
  "invalid-title",
  "wrong-kind",
  "unauthorized",
  "server-error",
] as const) {
  test(`Group POST ${mode} is never automatically replayed`, async ({ page, context }) => {
    const f = await fixture(context);
    await login(page);
    await draft(page);
    f.mode(mode);
    await create(page);
    const messages = {
      rate: "Too many requests. Wait before explicitly",
      conflict: "This key conflicts",
      result: "The original Group result",
      participant: "A participant is unavailable",
      "invalid-title": "The server rejected the title",
      "wrong-kind": "No creation result was confirmed",
      unauthorized: "Select a signed-in account",
      "server-error": "No creation result was confirmed",
    };
    await expect(page.getByText(new RegExp(messages[mode]))).toBeVisible();
    expect(f.posts()).toHaveLength(1);
    if (mode === "rate") {
      const retry = page.getByRole("button", { name: "Retry same operation" });
      await expect(retry).toBeDisabled();
      await expect(retry).toBeEnabled();
      await retry.click();
      await openGroupInfo(page);
      await expect(page.getByRole("region", { name: "Members", exact: true })).toBeVisible();
      expect(f.posts()[0]).toEqual(f.posts()[1]);
    }
  });
}

test("member paging handles 120 rows, role attribution, cursor restart and lost access", async ({
  page,
  context,
}) => {
  const f = await fixture(context);
  await login(page);
  await draft(page);
  await create(page);
  await openGroupInfo(page);
  await expect(
    page.getByRole("region", { name: "Members", exact: true }).getByText("alice", { exact: true }),
  ).toBeVisible();
  const g = [...f.groups.values()][0]!;
  g.members = Array.from({ length: 120 }, (_, n) => ({
    user: { id: id(n + 2000), username: `member_${n}` },
    role: n === 0 ? "owner" : n === 1 ? "admin" : "member",
    joined_at: date,
  }));
  const panel = page.getByRole("region", { name: "Members", exact: true });
  await panel.getByRole("button", { name: "Refresh members" }).click();
  await expect(panel.getByRole("listitem")).toHaveCount(50);
  f.mode("invalid-cursor");
  await panel.getByRole("button", { name: "Load more members" }).click();
  await panel.getByRole("button", { name: "Restart member list" }).click();
  await expect(panel.getByRole("listitem")).toHaveCount(50);
  await panel.getByRole("button", { name: "Load more members" }).click();
  await expect(panel.getByRole("listitem")).toHaveCount(100);
  await panel.getByRole("button", { name: "Load more members" }).click();
  await expect(panel.getByRole("listitem")).toHaveCount(120);
  await expect(panel.getByText("Admin", { exact: true })).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Remove member_0 from group", exact: true }),
  ).toHaveCount(0);
  await expect(
    panel.getByRole("button", { name: "Promote member_0 to Admin", exact: true }),
  ).toHaveCount(0);
  await expect(
    panel.getByRole("button", { name: "Transfer ownership to member_119", exact: true }),
  ).toBeVisible();
  f.mode("missing");
  await panel.getByRole("button", { name: "Refresh members" }).click();
  await expect(page.getByText("This conversation is unavailable.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Engineering 😀", exact: true })).toHaveCount(0);
  await expect(page.getByText("member_0", { exact: true })).toHaveCount(0);
});

for (const locale of ["en", "pt-BR", "es", "de"] as const) {
  test(`${locale}: Group review and members accessible at 320px`, async ({ page, context }) => {
    await fixture(context);
    await login(page);
    await page.goto("/#/preferences");
    await page.locator("select").first().selectOption(locale);
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/#/conversations/groups/new");
    const labels = resources[locale].common.groups;
    await page.getByLabel(labels.title, { exact: true }).fill("é".repeat(128));
    await page.getByRole("button", { name: labels.review, exact: true }).click();
    await expect(page.getByRole("button", { name: labels.create, exact: true })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole("button", { name: labels.create, exact: true }).click();
    await openGroupInfo(page, labels.info);
    await expect(page.getByRole("region", { name: labels.members, exact: true })).toContainText(
      "alice",
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

for (const mode of ["hold-post", "hold-lookup", "hold-members"] as const) {
  test(`${mode}: switching servers fences old results and uses only current server IDs`, async ({
    page,
    context,
  }) => {
    const f = await fixture(context);
    await login(page, "one");
    await login(page, "two");
    await draft(page);
    if (mode === "hold-members") {
      await create(page);
      await openGroupInfo(page);
      await expect(
        page
          .getByRole("region", { name: "Members", exact: true })
          .getByText("alice", { exact: true }),
      ).toBeVisible();
    }
    f.mode(mode);
    if (mode === "hold-post") await create(page);
    else if (mode === "hold-lookup") await add(page, "bob");
    else await page.getByRole("button", { name: "Refresh members" }).click();
    await f.started();
    await page.getByRole("button", { name: /^Accounts and servers/ }).click();
    await page
      .getByRole("button", {
        name: "Switch to alice on https://one.groups.test/proxy/",
        exact: true,
      })
      .click();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    f.release();
    await f.finished();
    await expect(page.getByRole("heading", { name: "Engineering 😀", exact: true })).toHaveCount(0);
    await draft(page, "Current server");
    await add(page, "bob");
    await expect(page.getByText("Participant added as Member.")).toBeVisible();
    await create(page);
    await openGroupInfo(page);
    await expect(page.getByRole("region", { name: "Members", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Engineering 😀", exact: true })).toHaveCount(0);
    await draft(page, "Current server");
    await add(page, "bob");
    await expect(page.getByRole("button", { name: "Remove bob" })).toBeVisible();
    await create(page);
    await expect(page.getByRole("heading", { name: "Current server", exact: true })).toBeVisible();
    expect(f.posts().at(-1)?.host).toBe("one.groups.test");
    expect(f.posts().at(-1)?.body).toEqual({
      kind: "group",
      title: "Current server",
      participant_ids: [id(3)],
    });
    expect(f.posts().at(-1)?.token).toBe("Bearer fixture.one.signature");
  });
}

for (const action of ["Log out", "Remove saved account", "forget", "reauthenticate"] as const) {
  test(`${action}: cross-tab Group POST contends safely and eventually releases profile ownership`, async ({
    page,
    context,
  }) => {
    const f = await fixture(context);
    await login(page);
    const writer = await context.newPage();
    await draft(writer);
    f.mode("hold-post");
    await create(writer);
    await f.started();
    if (action === "forget") {
      await page.goto("/#/servers");
      await page
        .getByRole("button", { name: "Forget server https://one.groups.test/proxy/", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Confirm forget https://one.groups.test/proxy/", exact: true })
        .click();
    } else if (action === "reauthenticate") {
      await page.goto("/#/servers");
      await page
        .getByRole("link", { name: "Sign in https://one.groups.test/proxy/", exact: true })
        .click();
      await page.getByLabel("Username").fill("alice");
      await page.getByLabel("Password", { exact: true }).fill("synthetic password");
      await page.getByRole("button", { name: "Sign in and save session" }).click();
    } else {
      await page.goto("/#/servers");
      await page.getByRole("button", { name: /^Accounts and servers/ }).click();
      await page
        .getByRole("button", {
          name: `${action} alice on https://one.groups.test/proxy/`,
          exact: true,
        })
        .click();
      await page.getByRole("button", { name: "Confirm", exact: true }).click();
    }
    const locks = () =>
      page.evaluate(async () => {
        const state = await navigator.locks.query();
        return {
          held:
            state.held?.filter((lock) => lock.name?.includes(":operation:profile-")).length ?? 0,
          pending:
            state.pending?.filter((lock) => lock.name?.includes(":operation:profile-")).length ?? 0,
        };
      });
    await expect.poll(locks).toEqual({ held: 1, pending: 1 });
    f.release();
    await f.finished();
    if (action === "reauthenticate") {
      await expect(page.getByText("Signed in as alice", { exact: true })).toBeVisible();
      await draft(writer);
      await expect(writer.getByRole("button", { name: "Review group", exact: true })).toBeEnabled();
    } else {
      await expect(writer.getByText("Select a signed-in account to see its inbox.")).toBeVisible();
      await expect(writer.getByRole("region", { name: "Members", exact: true })).toHaveCount(0);
    }
    await expect.poll(locks).toEqual({ held: 0, pending: 0 });
    expect(f.posts()).toHaveLength(1);
    await writer.close();
  });
}

test("two tabs with equal titles create distinct Groups, never a title-based uniqueness lookup", async ({
  page,
  context,
}) => {
  const f = await fixture(context);
  await login(page);
  await draft(page, "Same title");
  const other = await context.newPage();
  await draft(other, "Same title");
  f.mode("hold-post");
  await create(page);
  await f.started();
  await create(other);
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await navigator.locks.query()).pending?.filter((lock) =>
            lock.name?.includes(":operation:profile-"),
          ).length ?? 0,
      ),
    )
    .toBe(1);
  f.release();
  await f.finished();
  await openGroupInfo(page);
  await openGroupInfo(other);
  await expect(page.getByRole("region", { name: "Members", exact: true })).toContainText("alice");
  await expect(other.getByRole("region", { name: "Members", exact: true })).toContainText("alice");
  expect(f.groups.size).toBe(2);
  expect(f.posts()).toHaveLength(2);
  expect(f.posts()[0]?.key).not.toBe(f.posts()[1]?.key);
  await other.close();
});
