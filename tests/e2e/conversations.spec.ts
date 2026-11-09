import { expect, test } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { grant, user } from "../fixtures/authentication";
import { problem } from "../fixtures/instance";
import { resources } from "../../src/shared/i18n";

const first = "019a0000-0000-7000-8000-000000000011";
const second = "019a0000-0000-7000-8000-000000000012";
const date = "2026-11-06T12:00:00Z";
function conversation(id: string, title: string) {
  return {
    id,
    title,
    kind: "direct",
    created_at: date,
    updated_at: date,
    membership: { role: "direct" },
    unread_count: 2,
    last_message: null,
  };
}

test("inbox follows cursor, refreshes and fetches detail without read mutations", async ({
  page,
}) => {
  const calls: string[] = [];
  let refreshed = false;
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  };
  await page.route("https://inbox.test/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    calls.push(`${request.method()} ${url.pathname}${url.search}`);
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
          access_token: `fixture.${request.postDataJSON().username}.signature`,
          access_token_expires_at: new Date(Date.now() + 600_000).toISOString(),
          session_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        },
      });
    if (url.pathname.endsWith("/users/me")) {
      const bob = request.headers().authorization?.includes(".bob.");
      return route.fulfill({
        headers,
        json: bob ? { ...user, username: "bob", id: second } : user,
      });
    }
    if (url.pathname.endsWith(`/conversations/${first}`))
      return route.fulfill({
        headers,
        json: {
          ...conversation(first, "Fresh detail"),
          last_message: {
            id: second,
            conversation_id: first,
            sender_id: user.id,
            sender_username: "alice",
            created_at: date,
            content: null,
            deleted_at: date,
          },
        },
      });
    if (url.pathname.endsWith("/conversations")) {
      if (request.headers().authorization?.includes(".bob."))
        return route.fulfill({
          headers,
          json: { items: [conversation(second, "Bob private")], has_more: false },
        });
      if (url.searchParams.has("cursor"))
        return route.fulfill({
          headers,
          json: { items: [conversation(second, "Second")], has_more: false },
        });
      return route.fulfill({
        headers,
        json: {
          items: [conversation(first, refreshed ? "Refreshed" : "First")],
          has_more: true,
          next_cursor: "opaque",
        },
      });
    }
    return route.fulfill({
      status: 404,
      headers: { ...headers, "Content-Type": "application/problem+json" },
      json: problem(404, "conversation.not_found"),
    });
  });
  await page.goto("/#/conversations");
  await expect(page.getByText("Select a signed-in account to see its inbox.")).toBeVisible();
  expect(calls).toEqual([]);
  await page.goto("/#/connect");
  await page.getByLabel("Server URL").fill("https://inbox.test/");
  await page.getByRole("button", { name: "Check server", exact: true }).click();
  await page.getByRole("button", { name: "Save server", exact: true }).click();
  await page.goto("/#/");
  await page.getByRole("link", { name: /Sign in https:\/\/inbox.test/ }).click();
  await page.getByLabel("Username").fill("alice");
  await page.getByLabel("Password", { exact: true }).fill("synthetic password");
  await page.getByRole("button", { name: "Sign in and save session" }).click();
  await expect(page.getByText("Signed in as alice")).toBeVisible();
  await page.getByRole("link", { name: "Inbox", exact: true }).click();
  await expect(page.getByRole("link", { name: "First", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 800 });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.getByRole("link", { name: "Second", exact: true })).toBeVisible();
  refreshed = true;
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByRole("link", { name: "Refreshed", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Second", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Refreshed", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Fresh detail" })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await expect(page.getByText("Deleted message")).toBeVisible();
  await page.getByRole("link", { name: "Back to inbox" }).click();
  await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();
  await page.goto("/#/");
  await page.getByRole("link", { name: /Sign in https:\/\/inbox.test/ }).click();
  await page.getByLabel("Username").fill("bob");
  await page.getByLabel("Password", { exact: true }).fill("synthetic password");
  await page.getByRole("button", { name: "Sign in and save session" }).click();
  await expect(page.getByText("Signed in as bob")).toBeVisible();
  await page.getByRole("link", { name: "Inbox", exact: true }).click();
  await expect(page.getByText("Bob private")).toBeVisible();
  await page.getByRole("button", { name: /^Accounts and servers/ }).click();
  await page
    .getByRole("button", { name: "Switch to alice on https://inbox.test/", exact: true })
    .click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByText("Bob private")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Refreshed", exact: true })).toBeVisible();
  expect(calls).toContain("GET /v1/conversations?limit=50&cursor=opaque");
  expect(calls.some((call) => /read-state|messages/.test(call))).toBe(false);
});

async function isolatedServers(context: BrowserContext, page: Page) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  };
  let mode:
    | "normal"
    | "rate"
    | "missing"
    | "hold"
    | "hold-next"
    | "invalid-cursor"
    | "large"
    | "offline" = "normal";
  let release: (() => void) | undefined;
  let started: (() => void) | undefined;
  let finished: (() => void) | undefined;
  let requestStarted = Promise.resolve();
  let requestFinished = Promise.resolve();
  const calls: { host: string; path: string; authorization: string | undefined }[] = [];
  await context.route("https://*.inbox-isolation.test/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (request.method() === "DELETE") return route.fulfill({ status: 204, headers });
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
          access_token: `fixture.${url.hostname.startsWith("one.") ? "one" : "two"}.signature`,
          access_token_expires_at: new Date(Date.now() + 600_000).toISOString(),
          session_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        },
      });
    if (url.pathname.endsWith("/users/me")) return route.fulfill({ headers, json: user });
    if (url.pathname.includes("/conversations")) {
      calls.push({
        host: url.host,
        path: url.pathname,
        authorization: request.headers().authorization,
      });
      if (mode === "large" && url.pathname.endsWith("/conversations")) {
        const cursor = url.searchParams.get("cursor");
        const rows = Array.from({ length: cursor ? 3 : 50 }, (_, index) => {
          const n = index + (cursor ? 51 : 1);
          const id = `019a0000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;
          return conversation(id, `Conversation ${String(n).padStart(2, "0")}`);
        });
        return route.fulfill({
          headers,
          json: {
            items: rows,
            has_more: !cursor,
            ...(cursor ? {} : { next_cursor: "opaque-next" }),
          },
        });
      }
      const heldNext = mode === "hold-next";
      const held = mode === "hold" || heldNext;
      if (held) {
        mode = "normal";
        started?.();
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      } else if (mode === "offline") {
        mode = "normal";
        return route.abort("failed");
      } else if (mode === "invalid-cursor") {
        mode = "normal";
        return route.fulfill({
          status: 400,
          headers: { ...headers, "Content-Type": "application/problem+json" },
          json: problem(400, "pagination.invalid_cursor"),
        });
      } else if (mode === "rate") {
        mode = "normal";
        return route.fulfill({
          status: 429,
          headers: { ...headers, "Content-Type": "application/problem+json", "Retry-After": "1" },
          json: problem(429, "rate_limit.exceeded"),
        });
      } else if (mode === "missing") {
        mode = "normal";
        return route.fulfill({
          status: 404,
          headers: { ...headers, "Content-Type": "application/problem+json" },
          json: problem(404, "conversation.not_found"),
        });
      }
      const title = held
        ? "Old context private"
        : url.hostname.startsWith("one.")
          ? "Server one private"
          : "Server two private";
      try {
        return await route.fulfill({
          headers,
          json: url.pathname.endsWith("/conversations")
            ? {
                items: [conversation(first, heldNext ? "Late continuation" : title)],
                has_more: false,
              }
            : conversation(first, title),
        });
      } catch {
        // The browser may close a request after cancellation; its late response must not render.
        return;
      } finally {
        if (held) finished?.();
      }
    }
    return route.abort();
  });
  const add = async (name: string) => {
    await page.goto("/#/connect");
    await page.getByLabel("Server URL").fill(`https://${name}.inbox-isolation.test/`);
    await page.getByRole("button", { name: "Check server", exact: true }).click();
    await page.getByRole("button", { name: "Save server", exact: true }).click();
    await page.goto("/#/");
    await page
      .getByRole("link", { name: `Sign in https://${name}.inbox-isolation.test/`, exact: true })
      .click();
    await page.getByLabel("Username").fill("alice");
    await page.getByLabel("Password", { exact: true }).fill("synthetic password");
    await page.getByRole("button", { name: "Sign in and save session" }).click();
    await expect(page.getByText("Signed in as alice", { exact: true })).toBeVisible();
  };
  return {
    add,
    calls,
    setMode: (value: typeof mode) => {
      mode = value;
      if (value === "hold" || value === "hold-next") {
        requestStarted = new Promise<void>((resolve) => {
          started = resolve;
        });
        requestFinished = new Promise<void>((resolve) => {
          finished = resolve;
        });
      }
    },
    started: () => requestStarted,
    finished: () => requestFinished,
    release: () => release?.(),
  };
}

test("50-item first page, next cursor and direct detail link preserve server order", async ({
  page,
  context,
}) => {
  const f = await isolatedServers(context, page);
  await f.add("one");
  f.setMode("large");
  await page.goto(`/#/conversations/${first}`);
  await expect(page.getByRole("heading", { name: "Server one private" })).toBeVisible();
  await page.getByRole("link", { name: "Back to inbox" }).click();
  await expect(page.getByRole("listitem")).toHaveCount(50);
  await expect(page.getByRole("listitem").first()).toContainText("Conversation 01");
  await expect(page.getByRole("listitem").last()).toContainText("Conversation 50");
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.getByRole("listitem")).toHaveCount(53);
  await expect(page.getByRole("listitem").last()).toContainText("Conversation 53");
  await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);
});

test("refresh replaces a pending continuation and ignores its late response", async ({
  page,
  context,
}) => {
  const f = await isolatedServers(context, page);
  await f.add("one");
  f.setMode("large");
  await page.getByRole("link", { name: "Inbox", exact: true }).click();
  await expect(page.getByRole("listitem")).toHaveCount(50);
  f.setMode("hold-next");
  await page.getByRole("button", { name: "Load more" }).click();
  await f.started();
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByText("Server one private")).toBeVisible();
  f.release();
  await f.finished();
  await expect(page.getByText("Late continuation")).toHaveCount(0);
  await expect(page.getByText("Conversation 01")).toHaveCount(0);
  await expect(page.getByRole("listitem")).toHaveCount(1);
});

test("invalid cursor offers an explicit restart instead of retrying the cursor", async ({
  page,
  context,
}) => {
  const f = await isolatedServers(context, page);
  await f.add("one");
  f.setMode("large");
  await page.getByRole("link", { name: "Inbox", exact: true }).click();
  await expect(page.getByRole("listitem")).toHaveCount(50);
  f.setMode("invalid-cursor");
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.getByText(/This page has expired/)).toBeVisible();
  await page.getByRole("button", { name: "Restart inbox" }).click();
  await expect(page.getByText("Server one private")).toBeVisible();
  await expect(page.getByText("Conversation 01")).toHaveCount(0);
});

for (const locale of ["en", "pt-BR", "es", "de"] as const) {
  test(`${locale}: inbox and detail use localized labels at 320px`, async ({ page, context }) => {
    const f = await isolatedServers(context, page);
    await f.add("one");
    await page.setViewportSize({ width: 320, height: 800 });
    await page.getByRole("link", { name: "Preferences", exact: true }).click();
    await page.locator("select").first().selectOption(locale);
    const strings = resources[locale].common.conversations;
    await page.getByRole("link", { name: strings.inbox, exact: true }).click();
    await expect(page.getByRole("heading", { name: strings.inbox })).toBeVisible();
    await expect(page.getByText(strings.noMessages)).toBeVisible();
    await page.getByRole("link", { name: "Server one private" }).click();
    await expect(page.getByRole("heading", { name: strings.summary })).toBeVisible();
    await expect(page.getByText(strings.notice)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test("inbox and detail recover safely from 429 and inaccessible 404", async ({ page, context }) => {
  const f = await isolatedServers(context, page);
  await f.add("one");
  f.setMode("rate");
  await page.getByRole("link", { name: "Inbox", exact: true }).click();
  await expect(page.getByText(/Too many requests/)).toBeVisible();
  const retry = page.getByRole("button", { name: "Try again" });
  await expect(retry).toBeDisabled();
  await expect(retry).toBeEnabled({ timeout: 5000 });
  await retry.click();
  await page.getByRole("link", { name: "Server one private" }).waitFor();
  f.setMode("missing");
  await page.getByRole("link", { name: "Server one private" }).click();
  await expect(page.getByText("This conversation is unavailable.")).toBeVisible();
  await expect(page.getByText("Server one private")).toHaveCount(0);
  await page.getByRole("link", { name: "Back to inbox" }).click();
  await expect(page.getByRole("link", { name: "Server one private" })).toBeVisible();
});

test("inbox and detail recover from transport failure without displaying stale data", async ({
  page,
  context,
}) => {
  const f = await isolatedServers(context, page);
  await f.add("one");
  f.setMode("offline");
  await page.getByRole("link", { name: "Inbox", exact: true }).click();
  await expect(page.getByText(/Could not load conversations/)).toBeVisible();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("link", { name: "Server one private" })).toBeVisible();
  f.setMode("offline");
  await page.getByRole("link", { name: "Server one private" }).click();
  await expect(page.getByText(/Could not load conversations/)).toBeVisible();
  await expect(page.getByText("Server one private")).toHaveCount(0);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Server one private" })).toBeVisible();
});

for (const action of ["reauthenticate", "forget-server"] as const) {
  test(`${action} cannot publish a pending detail from the previous context`, async ({
    page,
    context,
  }) => {
    const f = await isolatedServers(context, page);
    await f.add("one");
    await page.getByRole("link", { name: "Inbox", exact: true }).click();
    await expect(page.getByRole("link", { name: "Server one private" })).toBeVisible();
    f.setMode("hold");
    await page.getByRole("link", { name: "Server one private" }).click();
    await f.started();
    await page.getByRole("link", { name: "Home", exact: true }).click();
    if (action === "reauthenticate") {
      await page
        .getByRole("link", { name: "Sign in https://one.inbox-isolation.test/", exact: true })
        .click();
      await page.getByLabel("Username").fill("alice");
      await page.getByLabel("Password", { exact: true }).fill("synthetic password");
      await page.getByRole("button", { name: "Sign in and save session" }).click();
      await expect(page.getByText("Signed in as alice", { exact: true })).toBeVisible();
      await page.getByRole("link", { name: "Inbox", exact: true }).click();
      await expect(page.getByRole("link", { name: "Server one private" })).toBeVisible();
    } else {
      await page
        .getByRole("button", {
          name: "Forget server https://one.inbox-isolation.test/",
          exact: true,
        })
        .click();
      await page
        .getByRole("button", {
          name: "Confirm forget https://one.inbox-isolation.test/",
          exact: true,
        })
        .click();
      await expect(page.getByText("No servers saved yet.")).toBeVisible();
      await page.getByRole("link", { name: "Inbox", exact: true }).click();
      await expect(page.getByText("Select a signed-in account to see its inbox.")).toBeVisible();
    }
    f.release();
    await f.finished();
    await expect(page.getByText("Old context private")).toHaveCount(0);
  });
}

test("cross-tab server selection drops a late detail response and isolates bearers", async ({
  page,
  context,
}) => {
  const f = await isolatedServers(context, page);
  await f.add("one");
  await f.add("two");
  await page.getByRole("link", { name: "Inbox", exact: true }).click();
  await expect(page.getByText("Server two private")).toBeVisible();
  const other = await context.newPage();
  await other.goto("/#/conversations");
  await expect(other.getByText("Server two private")).toBeVisible();
  f.setMode("hold");
  await other.getByRole("link", { name: "Server two private" }).click();
  await f.started();
  await page.getByRole("button", { name: /^Accounts and servers/ }).click();
  await page
    .getByRole("button", {
      name: "Switch to alice on https://one.inbox-isolation.test/",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByText("Server one private")).toBeVisible();
  await expect(other.getByText("Server two private")).toHaveCount(0);
  f.release();
  await f.finished();
  await expect(other.getByText("Server one private")).toBeVisible();
  await expect(other.getByText("Server two private")).toHaveCount(0);
  expect(
    f.calls
      .filter((call) => call.host.startsWith("one."))
      .every((call) => call.authorization === "Bearer fixture.one.signature"),
  ).toBe(true);
  expect(
    f.calls
      .filter((call) => call.host.startsWith("two."))
      .every((call) => call.authorization === "Bearer fixture.two.signature"),
  ).toBe(true);
  await other.close();
});

for (const action of ["Log out", "Remove saved account"] as const) {
  test(`${action} hides protected inbox data while a request is pending`, async ({
    page,
    context,
  }) => {
    const f = await isolatedServers(context, page);
    await f.add("one");
    await page.getByRole("link", { name: "Inbox", exact: true }).click();
    await expect(page.getByText("Server one private")).toBeVisible();
    const other = await context.newPage();
    await other.goto("/#/conversations");
    await expect(other.getByText("Server one private")).toBeVisible();
    f.setMode("hold");
    await page.getByRole("button", { name: "Refresh" }).click();
    await f.started();
    await page.getByRole("button", { name: /^Accounts and servers/ }).click();
    await page
      .getByRole("button", {
        name: `${action} alice on https://one.inbox-isolation.test/`,
        exact: true,
      })
      .click();
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(page.getByText("Server one private")).toHaveCount(0);
    f.release();
    await f.finished();
    await expect(page.getByText("Server one private")).toHaveCount(0);
    await expect(other.getByText("Server one private")).toHaveCount(0);
    await expect(page.getByText("Select a signed-in account to see its inbox.")).toBeVisible();
    await expect(other.getByText("Select a signed-in account to see its inbox.")).toBeVisible();
    await other.close();
  });
}
