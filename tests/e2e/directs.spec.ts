import { expect, test } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { grant, user } from "../fixtures/authentication";
import { problem } from "../fixtures/instance";
import { resources } from "../../src/shared/i18n";

const bob = "019a0000-0000-7000-8000-000000000003";
const bobTwo = "019a0000-0000-7000-8000-000000000004";
const cid = "019a0000-0000-7000-8000-000000000011";
const date = "2026-11-06T12:00:00Z";
type Mode =
  | "normal"
  | "drop"
  | "rate"
  | "conflict"
  | "unavailable-result"
  | "participant"
  | "wrong-kind"
  | "unauthorized"
  | "hold-post"
  | "hold-lookup";
type Call = {
  host: string;
  method: string;
  path: string;
  query: string;
  token: string;
  key: string;
  body: unknown;
};

async function fixture(context: BrowserContext) {
  let mode: Mode = "normal";
  let release: (() => void) | undefined;
  let started: (() => void) | undefined;
  let finished: (() => void) | undefined;
  let start = Promise.resolve();
  let finish = Promise.resolve();
  const calls: Call[] = [];
  const pairs = new Map<string, string>();
  const keys = new Map<string, string>();
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type, idempotency-key",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  };
  const dto = (id: string) => ({
    id,
    title: "Server-owned Direct",
    kind: "direct",
    membership: { role: "direct" },
    created_at: date,
    updated_at: date,
    unread_count: 0,
    last_message: null,
  });
  await context.route("https://*.directs.test/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    const token = req.headers().authorization ?? "";
    const actor = token.includes(".bob.") ? bob : user.id;
    const name = actor === bob ? "bob" : "alice";
    const body: unknown = req.postData() ? req.postDataJSON() : undefined;
    calls.push({
      host: url.host,
      method: req.method(),
      path: url.pathname,
      query: url.search,
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
    if (url.pathname.endsWith("/sessions")) {
      if (
        typeof body !== "object" ||
        body === null ||
        !("username" in body) ||
        typeof body.username !== "string"
      )
        throw new Error("Invalid fixture login.");
      const loginName = body.username;
      return route.fulfill({
        status: 201,
        headers,
        json: {
          ...grant,
          access_token: `fixture.${loginName}.signature`,
          access_token_expires_at: new Date(Date.now() + 600_000).toISOString(),
          session_expires_at: new Date(Date.now() + 86400_000).toISOString(),
        },
      });
    }
    if (url.pathname.endsWith("/users/me"))
      return route.fulfill({ headers, json: { ...user, id: actor, username: name } });
    const held =
      (mode === "hold-post" && req.method() === "POST") ||
      (mode === "hold-lookup" && url.pathname.endsWith("/users"));
    if (held) {
      mode = "normal";
      started?.();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    }
    try {
      if (url.pathname.endsWith("/users")) {
        const username = url.searchParams.get("username")?.toLowerCase();
        return await route.fulfill({
          headers,
          json: {
            items:
              username === "alice" || username === "bob"
                ? [
                    {
                      id:
                        username === "alice" ? user.id : url.host.startsWith("two.") ? bobTwo : bob,
                      username,
                    },
                  ]
                : [],
            has_more: false,
          },
        });
      }
      if (url.pathname.endsWith("/conversations") && req.method() === "POST") {
        const current = mode;
        mode = "normal";
        if (current === "rate") return await fail(429, "rate_limit.exceeded");
        if (current === "conflict") return await fail(409, "idempotency.key_reused");
        if (current === "unavailable-result")
          return await fail(409, "idempotency.result_unavailable");
        if (current === "participant")
          return await fail(422, "conversation.participant_unavailable");
        if (current === "unauthorized") return await fail(401, "auth.invalid_access_token");
        if (current === "wrong-kind")
          return await route.fulfill({
            headers,
            json: { ...dto(cid), kind: "group", membership: { role: "owner" } },
          });
        if (
          typeof body !== "object" ||
          body === null ||
          !("participant_id" in body) ||
          typeof body.participant_id !== "string"
        )
          throw new Error("Invalid fixture participant.");
        const participant = body.participant_id;
        const pair = `${url.host}:${[actor, participant].sort().join(":")}`;
        const key = `${url.host}:${actor}:${req.headers()["idempotency-key"]}`;
        const previous = pairs.get(pair);
        const id = previous ?? cid;
        const replay = keys.has(key);
        pairs.set(pair, id);
        keys.set(key, id); // Commit happens before a deliberately dropped response.
        if (current === "drop") return await route.abort("failed");
        return await route.fulfill({
          status: previous || replay ? 200 : 201,
          headers: { ...headers, ...(replay ? { "Idempotency-Replayed": "true" } : {}) },
          json: dto(id),
        });
      }
      if (url.pathname.endsWith("/conversations"))
        return await route.fulfill({ headers, json: { items: [], has_more: false } });
      if (url.pathname.endsWith(`/conversations/${cid}`))
        return await route.fulfill({ headers, json: dto(cid) });
      return await route.abort();
    } catch {
      if (!held) throw new Error("Unexpected fixture response failure.");
    } finally {
      if (held) finished?.();
    }
  });
  return {
    calls,
    pairs,
    posts: () => calls.filter((c) => c.method === "POST" && c.path.endsWith("/conversations")),
    mode: (next: Mode) => {
      mode = next;
      if (next === "hold-post" || next === "hold-lookup") {
        start = new Promise<void>((resolve) => {
          started = resolve;
        });
        finish = new Promise<void>((resolve) => {
          finished = resolve;
        });
      }
    },
    started: () => start,
    finished: () => finish,
    release: () => release?.(),
  };
}

async function login(page: Page, host = "one", username = "alice", save = true) {
  if (save) {
    await page.goto("/#/connect");
    await page.getByLabel("Server URL").fill(`https://${host}.directs.test/proxy/`);
    await page.getByRole("button", { name: "Check server", exact: true }).click();
    await page.getByRole("button", { name: "Save server", exact: true }).click();
  }
  await page.goto("/#/");
  await page
    .getByRole("link", { name: `Sign in https://${host}.directs.test/proxy/`, exact: true })
    .click();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill("synthetic password");
  await page.getByRole("button", { name: "Sign in and save session" }).click();
  await expect(page.getByText(`Signed in as ${username}`, { exact: true })).toBeVisible();
}
async function lookup(page: Page, username = "BOB") {
  await page.goto("/#/conversations/new");
  await page.getByLabel("Full username").fill(username);
  await page.getByRole("button", { name: "Find user", exact: true }).click();
}
async function confirm(page: Page) {
  await page.getByRole("button", { name: "Start conversation", exact: true }).click();
}

test("exact confirmation, new/existing/reverse-order/self Direct and authoritative detail", async ({
  page,
  context,
}) => {
  const f = await fixture(context);
  await login(page);
  await lookup(page);
  await expect(page.getByText(/Start a conversation with bob/)).toBeVisible();
  await expect(
    page.locator("main p").filter({ hasText: "https://one.directs.test/proxy/" }),
  ).toBeVisible();
  expect(f.posts()).toHaveLength(0);
  expect(f.calls.find((c) => c.path.endsWith("/users"))?.query).toBe("?username=BOB");
  await confirm(page);
  await expect(page.getByRole("heading", { name: "Server-owned Direct" })).toBeVisible();
  expect(f.posts()[0]?.body).toEqual({ kind: "direct", participant_id: bob });
  expect(f.posts()[0]?.key).toMatch(/^[0-9a-f-]{36}$/);
  await lookup(page, "bob");
  await confirm(page);
  await expect(page).toHaveURL(new RegExp(`/conversations/${cid}$`));
  await login(page, "one", "bob", false);
  await lookup(page, "alice");
  await confirm(page);
  await expect(page).toHaveURL(new RegExp(`/conversations/${cid}$`));
  expect(f.pairs.size).toBe(1);
  await lookup(page, "bob");
  await expect(page.getByText("Conversation with yourself")).toBeVisible();
  await confirm(page);
  await expect(page.getByRole("heading", { name: "Server-owned Direct" })).toBeVisible();
  expect(f.posts()[3]?.body).toEqual({ kind: "direct", participant_id: bob });
  expect(f.calls.filter((c) => c.key && !c.path.endsWith("/conversations"))).toEqual([]);
});

test("committed but dropped POST is retried only explicitly with the same payload and key", async ({
  page,
  context,
}) => {
  const f = await fixture(context);
  await login(page);
  await lookup(page);
  f.mode("drop");
  await confirm(page);
  await expect(page.getByText(/The conversation may already exist/)).toBeVisible();
  expect(f.pairs.size).toBe(1);
  expect(f.posts()).toHaveLength(1);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Server-owned Direct" })).toBeVisible();
  expect(f.posts()).toHaveLength(2);
  expect(f.posts()[0]).toEqual(f.posts()[1]);
  expect(f.pairs.size).toBe(1);
});

test("editing invalidates target/key and prevents stale confirmation; no autocomplete", async ({
  page,
  context,
}) => {
  const f = await fixture(context);
  await login(page);
  await lookup(page);
  f.mode("drop");
  await confirm(page);
  await expect(page.getByText(/The conversation may already exist/)).toBeVisible();
  await page.getByLabel("Full username").fill("alice");
  await expect(page.getByRole("button", { name: "Start conversation" })).toHaveCount(0);
  expect(f.calls.filter((c) => c.path.endsWith("/users"))).toHaveLength(1);
  await page.getByRole("button", { name: "Find user", exact: true }).click();
  await confirm(page);
  await expect(page.getByRole("heading", { name: "Server-owned Direct" })).toBeVisible();
  expect(f.posts()[1]?.key).not.toBe(f.posts()[0]?.key);
  expect(f.posts()[1]?.body).toEqual({ kind: "direct", participant_id: user.id });
});

test("missing and disabled are indistinguishable; invalid input never sends a lookup", async ({
  page,
  context,
}) => {
  const f = await fixture(context);
  await login(page);
  await lookup(page, "missing");
  await expect(page.getByText("No matching user could be found on this server.")).toBeVisible();
  await page.getByLabel("Full username").fill("disabled");
  await page.getByRole("button", { name: "Find user", exact: true }).click();
  await expect(page.getByText("No matching user could be found on this server.")).toBeVisible();
  const count = f.calls.length;
  await page.getByLabel("Full username").fill("<b>bob</b>");
  await page.getByRole("button", { name: "Find user", exact: true }).click();
  await expect(page.getByText(/Enter 3–32 ASCII/)).toBeVisible();
  expect(f.calls).toHaveLength(count);
  expect(f.posts()).toHaveLength(0);
});

for (const mode of [
  "rate",
  "conflict",
  "unavailable-result",
  "participant",
  "wrong-kind",
  "unauthorized",
] as const) {
  test(`POST ${mode} never triggers an automatic replay or success navigation`, async ({
    page,
    context,
  }) => {
    const f = await fixture(context);
    await login(page);
    await lookup(page);
    f.mode(mode);
    await confirm(page);
    if (mode === "unauthorized") {
      await expect(page.getByText("Select a signed-in account to see its inbox.")).toBeVisible();
    } else {
      const messages = {
        rate: "Too many requests.",
        conflict: "This attempt conflicts",
        "unavailable-result": "The previous conversation result",
        participant: "This participant is unavailable",
        "wrong-kind": "The conversation may already exist",
      };
      await expect(page.getByText(new RegExp(messages[mode]))).toBeVisible();
      if (mode === "rate") {
        const retry = page.getByRole("button", { name: "Try again", exact: true });
        await expect(retry).toBeDisabled();
        await expect(retry).toBeEnabled();
        await retry.click();
        await expect(page.getByRole("heading", { name: "Server-owned Direct" })).toBeVisible();
        expect(f.posts()[1]?.key).toBe(f.posts()[0]?.key);
      }
    }
    expect(f.posts()).toHaveLength(mode === "rate" ? 2 : 1);
  });
}

for (const locale of ["en", "pt-BR", "es", "de"] as const) {
  test(`${locale}: accessible confirmation at 320px`, async ({ page, context }) => {
    const f = await fixture(context);
    await login(page);
    await page.goto("/#/preferences");
    await page.locator("select").first().selectOption(locale);
    await page.setViewportSize({ width: 320, height: 800 });
    await page
      .getByRole("link", { name: resources[locale].common.conversations.inbox, exact: true })
      .click();
    const labels = resources[locale].common.direct;
    await page.getByRole("link", { name: labels.title, exact: true }).click();
    await page.getByLabel(labels.username).fill("bob");
    await page.getByRole("button", { name: labels.find, exact: true }).click();
    await expect(page.getByRole("button", { name: labels.start, exact: true })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(f.posts()).toHaveLength(0);
  });
}

test("two tabs confirm the same Direct with one in-flight operation per form and recover locks", async ({
  page,
  context,
}) => {
  const f = await fixture(context);
  await login(page);
  await lookup(page);
  const other = await context.newPage();
  await lookup(other);
  f.mode("hold-post");
  await confirm(page);
  await f.started();
  await page
    .getByRole("button", { name: "Start conversation", exact: true })
    .count()
    .then((count) => expect(count).toBe(0));
  await confirm(other);
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
  await expect(page.getByRole("heading", { name: "Server-owned Direct" })).toBeVisible();
  await expect(other.getByRole("heading", { name: "Server-owned Direct" })).toBeVisible();
  expect(f.posts()).toHaveLength(2);
  expect(f.pairs.size).toBe(1);
  expect(f.posts()[0]?.key).not.toBe(f.posts()[1]?.key);
  await other.close();
});

test("same usernames on different servers never mix lookup targets or POST authorization", async ({
  page,
  context,
}) => {
  const f = await fixture(context);
  await login(page, "one");
  await login(page, "two");
  await lookup(page, "bob");
  await confirm(page);
  await expect(page.getByRole("heading", { name: "Server-owned Direct" })).toBeVisible();
  await page.getByRole("button", { name: /^Accounts and servers/ }).click();
  await page
    .getByRole("button", {
      name: "Switch to alice on https://one.directs.test/proxy/",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await lookup(page, "bob");
  await confirm(page);
  await expect(page.getByRole("heading", { name: "Server-owned Direct" })).toBeVisible();
  expect(f.posts().map((call) => call.host)).toEqual(["two.directs.test", "one.directs.test"]);
  expect(f.posts().map((call) => call.body)).toEqual([
    { kind: "direct", participant_id: bobTwo },
    { kind: "direct", participant_id: bob },
  ]);
  expect(
    f
      .posts()
      .every(
        (call) =>
          call.path === "/proxy/v1/conversations" &&
          call.token === "Bearer fixture.alice.signature",
      ),
  ).toBe(true);
  expect(f.posts()[0]?.key).not.toBe(f.posts()[1]?.key);
});

for (const mode of ["hold-lookup", "hold-post"] as const) {
  test(`${mode}: switching to another ready server fences the old identity and navigation`, async ({
    page,
    context,
  }) => {
    const f = await fixture(context);
    await login(page, "one");
    await login(page, "two");
    if (mode === "hold-post") await lookup(page);
    f.mode(mode);
    if (mode === "hold-post") await confirm(page);
    else await lookup(page);
    await f.started();
    await page.getByRole("button", { name: /^Accounts and servers/ }).click();
    await page
      .getByRole("button", {
        name: "Switch to alice on https://one.directs.test/proxy/",
        exact: true,
      })
      .click();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByLabel("Full username")).toHaveValue("");
    f.release();
    await f.finished();
    await expect(page.getByRole("button", { name: "Start conversation", exact: true })).toHaveCount(
      0,
    );
    await expect(page.getByRole("heading", { name: "Server-owned Direct" })).toHaveCount(0);
    expect(f.posts()).toHaveLength(mode === "hold-post" ? 1 : 0);
    if (mode === "hold-post") expect(f.posts()[0]?.host).toBe("two.directs.test");
  });
  test(`${mode}: account deselection discards a dispatched result without remote rollback claims`, async ({
    page,
    context,
  }) => {
    const f = await fixture(context);
    await login(page);
    if (mode === "hold-post") await lookup(page);
    f.mode(mode);
    if (mode === "hold-post") await confirm(page);
    else await lookup(page);
    await f.started();
    await page.getByRole("button", { name: /^Accounts and servers/ }).click();
    await page.getByRole("button", { name: "Use no account", exact: true }).click();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByText("Select a signed-in account to see its inbox.")).toBeVisible();
    f.release();
    await f.finished();
    await expect(page.getByRole("button", { name: "Start conversation", exact: true })).toHaveCount(
      0,
    );
    await expect(page.getByRole("heading", { name: "Server-owned Direct" })).toHaveCount(0);
    expect(f.posts()).toHaveLength(mode === "hold-post" ? 1 : 0);
  });
}

for (const action of ["Log out", "Remove saved account", "forget", "reauthenticate"] as const) {
  test(`${action} contends with a dispatched POST in another tab and cannot reactivate stale data`, async ({
    page,
    context,
  }) => {
    const f = await fixture(context);
    await login(page);
    const writer = await context.newPage();
    await lookup(writer);
    f.mode("hold-post");
    await confirm(writer);
    await f.started();
    if (action === "forget") {
      await page.goto("/#/");
      await page
        .getByRole("button", { name: "Forget server https://one.directs.test/proxy/", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: "Confirm forget https://one.directs.test/proxy/",
          exact: true,
        })
        .click();
    } else if (action === "reauthenticate") {
      await page.goto("/#/");
      await page
        .getByRole("link", { name: "Sign in https://one.directs.test/proxy/", exact: true })
        .click();
      await page.getByLabel("Username").fill("alice");
      await page.getByLabel("Password", { exact: true }).fill("synthetic password");
      await page.getByRole("button", { name: "Sign in and save session" }).click();
    } else {
      await page.getByRole("button", { name: /^Accounts and servers/ }).click();
      await page
        .getByRole("button", {
          name: `${action} alice on https://one.directs.test/proxy/`,
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
      // Creation may have completed before the waiting identity change committed.
      // What matters is that the replacement context is authoritative afterward.
      await writer.goto("/#/conversations/new");
      await expect(writer.getByRole("button", { name: "Find user", exact: true })).toBeEnabled();
    } else {
      await expect(writer.getByText("Select a signed-in account to see its inbox.")).toBeVisible();
      await expect(writer.getByRole("heading", { name: "Server-owned Direct" })).toHaveCount(0);
    }
    await expect.poll(locks).toEqual({ held: 0, pending: 0 });
    expect(f.posts()).toHaveLength(1);
    await writer.close();
  });
}
