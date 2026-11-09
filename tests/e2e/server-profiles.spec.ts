import { expect, test } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";

test("explicit inspect/save/reload/dedupe/rename/reinspect/confirmed-forget has no auth effects", async ({
  page,
}) => {
  let requests = 0;
  await page.route("https://profiles.test/**", async (route) => {
    requests++;
    expect(route.request().method()).toBe("GET");
    expect(route.request().headers().authorization).toBeUndefined();
    await route.fulfill({
      json: {
        service: "windwatcher",
        api_versions: ["v1"],
        auth_methods: ["password"],
        registration: "closed",
      },
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  });
  await page.goto("/#/connect");
  await page.getByLabel("Server URL").fill("https://PROFILES.test:443/proxy/");
  await page.getByRole("button", { name: "Check server", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save server", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await page.getByLabel("Local display label").fill("My saved server");
  await page.getByRole("button", { name: "Save server", exact: true }).click();
  await expect(page.getByText(/Server saved locally/)).toBeVisible();
  await page.reload();
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My saved server" })).toBeVisible();
  expect(requests).toBe(1);
  const stored = await page.evaluate(() =>
    Object.entries(localStorage).map(([key, value]) => [key, JSON.parse(value)]),
  );
  expect(stored).toHaveLength(1);
  expect(stored[0]![0]).toContain("windwatcher-client:");
  const state = stored[0]![1];
  expect(state.accounts).toEqual([]);
  expect(state.selectedAccountId).toBeNull();
  expect(Object.keys(state).sort()).toEqual([
    "accounts",
    "authOperations",
    "revision",
    "schemaVersion",
    "selectedAccountId",
    "serverProfiles",
  ]);
  await page.getByLabel("Local display label").fill("Renamed");
  await page
    .getByRole("button", { name: "Rename https://profiles.test/proxy/", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Renamed" })).toBeVisible();
  await page.getByRole("link", { name: "Inspect again" }).click();
  await expect(page.getByLabel("Server URL")).toHaveValue("https://profiles.test/proxy/");
  expect(requests).toBe(1);
  await page.getByRole("button", { name: "Check server", exact: true }).click();
  await expect(page.getByText(/already saved as Renamed/)).toBeVisible();
  await page.getByRole("button", { name: "Update existing server" }).click();
  await expect(page.getByText(/Server saved locally/)).toBeVisible();
  await page.getByRole("link", { name: "Home", exact: true }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page
    .getByRole("button", { name: "Forget server https://profiles.test/proxy/", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Renamed" })).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm forget https://profiles.test/proxy/", exact: true })
    .click();
  await expect(page.getByText("No servers saved yet.")).toBeVisible();
  expect(requests).toBe(2);
});

test("corruption and denied browser storage are visible and never reset", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("windwatcher-client:%2F:v1:state", "{broken"));
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("damaged storage");
  expect(await page.evaluate(() => localStorage.getItem("windwatcher-client:%2F:v1:state"))).toBe(
    "{broken",
  );
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("private", "SecurityError");
      },
    });
  });
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("Storage access was denied");
});

for (const mode of ["light", "dark"] as const) {
  test(`German ${mode} profiles fit 320px at 200% text with contrast and reduced motion`, async ({
    page,
  }) => {
    await page.goto("/");
    await page.evaluate(() => {
      const now = new Date().toISOString();
      localStorage.setItem(
        "windwatcher-client:%2F:v1:state",
        JSON.stringify({
          schemaVersion: 1,
          revision: 1,
          accounts: [],
          selectedAccountId: null,
          serverProfiles: [
            {
              id: crypto.randomUUID(),
              canonicalUrl: "https://profiles.test/long-proxy-prefix/",
              label: "Langfristig gespeicherter Unternehmensserver",
              discovery: { kind: "legacy", inspectedAt: now, legacyAcknowledgedAt: now },
              createdAt: now,
              updatedAt: now,
            },
          ],
        }),
      );
    });
    await page.reload();
    await page.getByRole("link", { name: "Preferences", exact: true }).click();
    await page.getByLabel("Appearance", { exact: true }).selectOption(mode);
    await page.getByLabel("Language", { exact: true }).selectOption("de");
    await page.getByRole("link", { name: "Startseite", exact: true }).click();
    await page.setViewportSize({ width: 320, height: 900 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
    await expect(page.getByRole("heading", { name: "Gespeicherte Server" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page
      .getByRole("button", {
        name: "Umbenennen https://profiles.test/long-proxy-prefix/",
        exact: true,
      })
      .focus();
    await page.keyboard.press("Tab");
    const forget = page.getByRole("button", {
      name: "Server vergessen https://profiles.test/long-proxy-prefix/",
      exact: true,
    });
    await expect(forget).toBeFocused();
    await expect(forget).toHaveCSS("outline-style", "solid");
    await expect(forget).toHaveCSS("forced-color-adjust", "auto");
    // Full authored-palette contrast was checked above. Axe's contrast rule
    // misreads authored token foregrounds against forced Canvas backgrounds.
    expect(
      (await new AxeBuilder({ page }).disableRules(["color-contrast"]).analyze()).violations,
    ).toEqual([]);
  });
}

test("an observed change in another tab requires explicit reload", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.getByText("No servers saved yet.")).toBeVisible();
  const other = await context.newPage();
  await other.goto("/");
  await other.evaluate(() =>
    localStorage.setItem(
      "windwatcher-client:%2F:v1:state",
      JSON.stringify({
        schemaVersion: 1,
        revision: 1,
        serverProfiles: [],
        accounts: [],
        selectedAccountId: null,
      }),
    ),
  );
  await expect(page.getByRole("alert")).toContainText("changed elsewhere");
  await page.getByRole("button", { name: "Reload saved state and retry" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText("No servers saved yet.")).toBeVisible();
});

test("quota failure never announces a saved profile", async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("private", "QuotaExceededError");
    };
  });
  await page.route("https://profiles.test/**", async (route) =>
    route.fulfill({
      json: {
        service: "windwatcher",
        api_versions: ["v1"],
        auth_methods: ["password"],
        registration: "closed",
      },
      headers: { "Access-Control-Allow-Origin": "*" },
    }),
  );
  await page.goto("/#/connect");
  await page.getByLabel("Server URL").fill("https://profiles.test/");
  await page.getByRole("button", { name: "Check server", exact: true }).click();
  await page.getByRole("button", { name: "Save server", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Storage is full");
  await expect(page.getByText(/Server saved locally/)).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});

test("nested static prefix has an independent storage namespace", async ({ page }) => {
  await page.goto("http://127.0.0.1:4176/client/");
  await page.evaluate(() => localStorage.setItem("windwatcher-client:%2F:v1:state", "{broken"));
  await page.reload();
  await expect(page.getByText("No servers saved yet.")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});
