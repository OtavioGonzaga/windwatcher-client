import { expect, test } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { grant, user } from "../fixtures/authentication";
import { problem } from "../fixtures/instance";

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
