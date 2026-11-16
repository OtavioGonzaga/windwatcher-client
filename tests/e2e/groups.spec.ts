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
  let mode: Mode = "normal";
  let release: (() => void) | undefined;
  let began: (() => void) | undefined;
  let ended: (() => void) | undefined;
  let started = Promise.resolve();
  let finished = Promise.resolve();
  const groups = new Map<string, Group>();
  const keys = new Map<string, { fingerprint: string; id: string }>();
  const calls: Call[] = [];
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type, idempotency-key",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
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
    if (req.method() === "DELETE") return route.fulfill({ status: 204, headers });
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
      (mode === "hold-members" && url.pathname.endsWith("/members"));
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
      if (!g || g.host !== url.host || mode === "missing")
        return await fail(404, "conversation.not_found");
      if (url.pathname.endsWith("/members")) {
        if (mode === "invalid-cursor") {
          mode = "normal";
          return await fail(400, "pagination.invalid_cursor");
        }
        const cursor = url.searchParams.get("cursor");
        if (cursor && !/^opaque-\d+$/.test(cursor))
          return await fail(400, "pagination.invalid_cursor");
        const offset = cursor ? Number(cursor.replace("opaque-", "")) : 0;
        const rows = g.members.slice(offset, offset + 50);
        const more = offset + 50 < g.members.length;
        const repeat = mode === "repeated-cursor";
        const badRole = mode === "direct-role";
        mode = "normal";
        return await route.fulfill({
          headers,
          json: {
            items: badRole ? rows.map((m) => ({ ...m, role: "direct" })) : rows,
            has_more: repeat || more,
            ...(repeat || more ? { next_cursor: repeat ? cursor : `opaque-${offset + 50}` } : {}),
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
    mode: (next: Mode) => {
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
  await page.goto("/#/");
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

test("owner-only and populated Group creation preserve title and fetch authoritative membership", async ({
  page,
  context,
}) => {
  const f = await fixture(context);
  await login(page);
  await page.getByRole("link", { name: "Inbox", exact: true }).click();
  await page.getByRole("link", { name: "New group", exact: true }).click();
  await page.getByLabel("Group title", { exact: true }).fill("Owner only");
  await expect(page.getByText("Only you will join this Group as Owner.")).toBeVisible();
  await create(page);
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
  await expect(page.getByLabel("Group title", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Acknowledge risk and edit" }).click();
  await create(page);
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
  await expect(panel.getByRole("button", { name: /Remove|Transfer|Rename/ })).toHaveCount(0);
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
      await page.goto("/#/");
      await page
        .getByRole("button", { name: "Forget server https://one.groups.test/proxy/", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Confirm forget https://one.groups.test/proxy/", exact: true })
        .click();
    } else if (action === "reauthenticate") {
      await page.goto("/#/");
      await page
        .getByRole("link", { name: "Sign in https://one.groups.test/proxy/", exact: true })
        .click();
      await page.getByLabel("Username").fill("alice");
      await page.getByLabel("Password", { exact: true }).fill("synthetic password");
      await page.getByRole("button", { name: "Sign in and save session" }).click();
    } else {
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
  await expect(page.getByRole("region", { name: "Members", exact: true })).toContainText("alice");
  await expect(other.getByRole("region", { name: "Members", exact: true })).toContainText("alice");
  expect(f.groups.size).toBe(2);
  expect(f.posts()).toHaveLength(2);
  expect(f.posts()[0]?.key).not.toBe(f.posts()[1]?.key);
  await other.close();
});
