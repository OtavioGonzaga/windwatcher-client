import { expect, test } from "@playwright/test";
import { grant, user } from "../fixtures/authentication";

test("two same-origin tabs do not reuse a rotating refresh credential", async ({
  page,
  context,
}) => {
  let refreshes = 0;
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  };
  const expiry = new Date(Date.now() + 60_000).toISOString();
  const end = new Date(Date.now() + 86_400_000).toISOString();
  await context.addInitScript(() => {
    const now = Date.now.bind(Date);
    Date.now = () => now() + Number(localStorage.getItem("fixture-clock-advance") ?? 0);
  });
  await context.route("https://refresh-auth.test/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (path.endsWith("/instance"))
      return route.fulfill({
        headers,
        json: {
          service: "windwatcher",
          api_versions: ["v1"],
          auth_methods: ["password"],
          registration: "open",
        },
      });
    if (path.endsWith("/users/me")) return route.fulfill({ headers, json: user });
    if (path.endsWith("/sessions/refresh")) {
      refreshes++;
      return route.fulfill({
        headers,
        json: {
          ...grant,
          access_token: "renewed.header.signature",
          refresh_token: Buffer.alloc(32, 1).toString("base64url"),
          access_token_expires_at: new Date(Date.now() + 180_000).toISOString(),
          session_expires_at: end,
        },
      });
    }
    if (path.endsWith("/sessions"))
      return route.fulfill({
        status: 201,
        headers,
        json: { ...grant, access_token_expires_at: expiry, session_expires_at: end },
      });
    await route.abort();
  });
  await page.goto("/#/connect");
  await page.getByLabel("Server URL").fill("https://refresh-auth.test/");
  await page.getByRole("button", { name: "Check server", exact: true }).click();
  await page.getByRole("button", { name: "Save server", exact: true }).click();
  await page.goto("/#/");
  await page.getByRole("link", { name: /Sign in https:\/\/refresh-auth.test/ }).click();
  await page.getByLabel("Username").fill("alice");
  await page.getByLabel("Password", { exact: true }).fill("synthetic password");
  await page.getByRole("button", { name: "Sign in and save session" }).click();
  await expect(page.getByText("Signed in as alice")).toBeVisible();
  const second = await context.newPage();
  await page.evaluate(() => localStorage.setItem("fixture-clock-advance", "58000"));
  await Promise.all([page.reload(), second.goto("/#/")]);
  await expect.poll(() => refreshes).toBe(1);
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const entry = Object.entries(localStorage).find(([key]) => key.endsWith(":state"));
        return entry ? JSON.parse(entry[1]).accounts[0]?.session?.generation : undefined;
      }),
    )
    .toBe(2);
  expect(refreshes).toBe(1);
  await second.close();
});

test("missing Web Locks refuses login before sending a password", async ({ page, context }) => {
  let loginPosts = 0;
  await page.route("https://no-locks.test/**", async (route) => {
    if (route.request().method() === "POST") loginPosts++;
    await route.fulfill({
      headers: { "Access-Control-Allow-Origin": "*" },
      json: {
        service: "windwatcher",
        api_versions: ["v1"],
        auth_methods: ["password"],
        registration: "open",
      },
    });
  });
  await page.goto("/#/connect");
  await page.getByLabel("Server URL").fill("https://no-locks.test/");
  await page.getByRole("button", { name: "Check server", exact: true }).click();
  await page.getByRole("button", { name: "Save server", exact: true }).click();
  await context.addInitScript(() =>
    Object.defineProperty(navigator, "locks", { value: undefined }),
  );
  await page.goto("/#/");
  await page.reload();
  await page.getByRole("link", { name: /Sign in https:\/\/no-locks.test/ }).click();
  await page.getByLabel("Username").fill("alice");
  await page.getByLabel("Password", { exact: true }).fill("synthetic password");
  await page.getByRole("button", { name: "Sign in and save session" }).click();
  await expect(page.getByText(/Safe session storage requires Web Locks/)).toBeVisible();
  expect(loginPosts).toBe(0);
});
