import { expect, test } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { grant, user } from "../fixtures/authentication";

test("register, sign in, persist and restore a verified session", async ({ page }) => {
  const calls: string[] = [];
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  };
  await page.route("https://auth.test/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers });
      return;
    }
    calls.push(`${request.method()} ${url.pathname}`);
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
    if (url.pathname.endsWith("/users/me")) return route.fulfill({ headers, json: user });
    if (url.pathname.endsWith("/users")) return route.fulfill({ status: 201, headers, json: user });
    if (url.pathname.endsWith("/sessions"))
      return route.fulfill({
        status: 201,
        headers,
        json: {
          ...grant,
          access_token_expires_at: new Date(Date.now() + 600_000).toISOString(),
          session_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        },
      });
    await route.abort();
  });
  await page.goto("/#/connect");
  await page.getByLabel("Server URL").fill("https://auth.test/");
  await page.getByRole("button", { name: "Check server", exact: true }).click();
  await page.getByRole("button", { name: "Save server", exact: true }).click();
  await page.goto("/#/");
  await page.getByRole("link", { name: /Sign in https:\/\/auth.test/ }).click();
  await page.getByRole("link", { name: "Create an account on this server" }).click();
  await expect(page.getByText("Self-registration is currently advertised as open.")).toBeVisible();
  await page.getByLabel("Username").fill("alice");
  await page.getByLabel("Password", { exact: true }).fill("synthetic password");
  await page.getByLabel("Confirm password").fill("synthetic password");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByText(/Account created\. Registration does not sign you in/)).toBeVisible();
  expect(calls.filter((call) => call === "POST /v1/sessions")).toHaveLength(0);
  await page.getByRole("link", { name: "Go to sign in" }).first().click();
  await page.getByLabel("Username").fill("alice");
  await page.getByLabel("Password", { exact: true }).fill("synthetic password");
  await page.getByRole("button", { name: "Sign in and save session" }).click();
  await expect(page.getByText("Signed in as alice")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Signed in as alice")).toBeVisible();
  expect(calls.filter((call) => call === "POST /v1/sessions")).toHaveLength(1);
  expect(calls.filter((call) => call === "GET /v1/users/me").length).toBeGreaterThanOrEqual(2);
  const stored = await page.evaluate(() => Object.entries(localStorage));
  const document = stored.find(([key]) => key.endsWith(":state"))?.[1] ?? "";
  expect(document).not.toContain(grant.access_token);
  expect(document).not.toContain(grant.refresh_token);
  expect(document).not.toContain("synthetic password");
});

test("closed registration never submits credentials and still permits sign-in", async ({
  page,
}) => {
  let posts = 0;
  await page.route("https://closed-auth.test/**", async (route) => {
    if (route.request().method() === "POST") posts++;
    await route.fulfill({
      headers: { "Access-Control-Allow-Origin": "*" },
      json: {
        service: "windwatcher",
        api_versions: ["v1"],
        auth_methods: ["password"],
        registration: "closed",
      },
    });
  });
  await page.goto("/#/connect");
  await page.getByLabel("Server URL").fill("https://closed-auth.test/");
  await page.getByRole("button", { name: "Check server", exact: true }).click();
  await page.getByRole("button", { name: "Save server", exact: true }).click();
  await page.goto("/#/");
  await page.getByRole("link", { name: /Sign in https:\/\/closed-auth.test/ }).click();
  await page.getByRole("link", { name: "Create an account on this server" }).click();
  await expect(page.getByText(/Self-registration is closed/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Create account", exact: true })).toBeDisabled();
  await page.getByRole("link", { name: "Go to sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign in and save session" })).toBeEnabled();
  expect(posts).toBe(0);
});
