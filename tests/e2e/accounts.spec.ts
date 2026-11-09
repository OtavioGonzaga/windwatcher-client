import { expect, test } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { grant, user } from "../fixtures/authentication";
import { resources } from "../../src/shared/i18n";

async function fixture(context: BrowserContext, page: Page) {
  const deletes: string[] = [];
  let offlineLogout = false;
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  };
  await context.route("https://*.accounts.test/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (request.method() === "DELETE") {
      deletes.push(url.origin);
      if (offlineLogout) return route.abort("failed");
      return route.fulfill({ status: 204, headers });
    }
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
      const body: unknown = request.postDataJSON();
      if (
        !body ||
        typeof body !== "object" ||
        !("username" in body) ||
        typeof body.username !== "string"
      )
        throw new Error("Expected synthetic login username.");
      const { username } = body;
      return route.fulfill({
        status: 201,
        headers,
        json: {
          ...grant,
          access_token: `fixture.${username}.signature`,
          access_token_expires_at: new Date(Date.now() + 600_000).toISOString(),
          session_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        },
      });
    }
    if (url.pathname.endsWith("/users/me")) {
      const username = request.headers().authorization?.includes(".bob.") ? "bob" : "alice";
      return route.fulfill({
        headers,
        json: {
          ...user,
          username,
          id: username === "bob" ? "019a0000-0000-7000-8000-000000000002" : user.id,
        },
      });
    }
    return route.abort();
  });
  const save = async (server: string) => {
    await page.goto("/#/connect");
    await page.getByLabel("Server URL").fill(`https://${server}.accounts.test/`);
    await page.getByRole("button", { name: "Check server", exact: true }).click();
    await page.getByRole("button", { name: "Save server", exact: true }).click();
    await expect(page.getByText(/Server saved locally/)).toBeVisible();
  };
  const login = async (server: string, username: string) => {
    await page.goto("/#/");
    await page
      .getByRole("link", { name: `Sign in https://${server}.accounts.test/`, exact: true })
      .click();
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password", { exact: true }).fill("synthetic password");
    await page.getByRole("button", { name: "Sign in and save session" }).click();
    await expect(page.getByText(`Signed in as ${username}`, { exact: true })).toBeVisible();
  };
  await save("one");
  await login("one", "alice");
  await login("one", "bob");
  await save("two");
  await login("two", "alice");
  return {
    deletes,
    offline: () => {
      offlineLogout = true;
    },
  };
}

test("switch accounts, clear selection, persist, log out offline and remove locally", async ({
  page,
  context,
}) => {
  const f = await fixture(context, page);
  const trigger = page.getByRole("button", { name: /^Accounts and servers/ });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await dialog
    .getByRole("button", { name: "Switch to bob on https://one.accounts.test/", exact: true })
    .click();
  await expect(dialog.getByText("Active — verified", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByText("Signed in as bob", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Signed in as bob", { exact: true })).toBeVisible();
  await trigger.click();
  await dialog.getByRole("button", { name: "Use no account", exact: true }).click();
  await expect(dialog.getByText("Active — verified")).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "Switch to alice on https://one.accounts.test/", exact: true })
    .click();
  await expect(dialog.getByText("Active — verified", { exact: true })).toBeVisible();
  f.offline();
  await dialog
    .getByRole("button", { name: "Log out alice on https://one.accounts.test/", exact: true })
    .click();
  await expect(dialog.getByRole("button", { name: "Confirm", exact: true })).toBeFocused();
  await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(dialog.getByText(/Remote revocation was not confirmed/)).toBeVisible();
  expect(f.deletes).toEqual(["https://one.accounts.test"]);
  await dialog
    .getByRole("button", {
      name: "Remove saved account alice on https://one.accounts.test/",
      exact: true,
    })
    .click();
  await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(dialog.getByText(/No remote revocation was requested/)).toBeVisible();
  expect(f.deletes).toHaveLength(1);
  await expect(
    dialog.getByRole("button", {
      name: "Switch to bob on https://one.accounts.test/",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", {
      name: "Switch to alice on https://two.accounts.test/",
      exact: true,
    }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test("selection and logout reconcile across two real browser tabs", async ({ page, context }) => {
  await fixture(context, page);
  const second = await context.newPage();
  await second.goto("/#/");
  await expect(second.getByText("Signed in as alice", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Accounts and servers/ }).click();
  await page
    .getByRole("button", { name: "Switch to bob on https://one.accounts.test/", exact: true })
    .click();
  await expect(second.getByText("Signed in as bob", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Log out bob on https://one.accounts.test/", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByText(/server confirmed revocation/)).toBeVisible();
  await expect(second.getByText("Signed in as bob", { exact: true })).toHaveCount(0);
  await second.reload();
  await expect(second.getByText("Signed in as bob", { exact: true })).toHaveCount(0);
  await second.close();
});

for (const locale of ["de", "pt-BR"] as const) {
  test(`${locale}: account selector and confirmation fit 320px at enlarged text`, async ({
    page,
    context,
  }) => {
    await fixture(context, page);
    await page.getByRole("link", { name: "Preferences", exact: true }).click();
    await page.getByLabel("Language").selectOption(locale);
    await page.setViewportSize({ width: 320, height: 640 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    const copy = resources[locale].common.accounts;
    await page.getByRole("button", { name: new RegExp(`^${copy.title}`) }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await dialog
      .getByRole("button", {
        name: copy.logoutLabel
          .replace("{{username}}", "alice")
          .replace("{{server}}", "https://one.accounts.test/"),
        exact: true,
      })
      .click();
    await expect(dialog.getByRole("button", { name: copy.confirm, exact: true })).toBeFocused();
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });
}
