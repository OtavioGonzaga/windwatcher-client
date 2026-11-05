import { expect, test } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";

test("shell fixture keeps text focus across resize and restores scroll on history", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:4177/tests/shell/index.html#/preferences");
  const field = page.getByRole("textbox");
  await field.fill("local keyboard smoke");
  await page.setViewportSize({ width: 800, height: 360 });
  await expect(field).toBeFocused();
  await page.setViewportSize({ width: 320, height: 500 });
  await expect(field).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await page.goBack();
  await expect(page.getByRole("link", { name: "Home", exact: true })).toBeFocused();
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
});

test("short landscape supports touch or mouse navigation without overflow", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 640, height: 320 });
  await page.goto("/");
  const preferences = page.getByRole("link", { name: "Preferences", exact: true });
  if (info.project.use.hasTouch) await preferences.tap();
  else await preferences.click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Preferences");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("browser navigation never loads Android adapter or writes preferences", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await page.goto("/");
  await page.getByRole("link", { name: "Preferences", exact: true }).click();
  await page.getByLabel("Appearance").selectOption("dark");
  await page.getByRole("link", { name: "Home", exact: true }).click();
  expect(requests.every((url) => new URL(url).origin === "http://127.0.0.1:4173")).toBe(true);
  expect(requests.some((url) => url.includes("android-back"))).toBe(false);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
});

test("skip link, route focus, history and presentation state remain coherent", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("body")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  await expect(page).not.toHaveURL(/main-content/);
  await page.getByRole("link", { name: "Preferences", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await page.getByLabel("Language").selectOption("es");
  await page.getByLabel("Apariencia").selectOption("dark");
  await expect(page).toHaveTitle("Preferencias — Windwatcher");
  await page.getByRole("link", { name: "Inicio", exact: true }).click();
  await page.goBack();
  await expect(page.getByRole("link", { name: "Inicio", exact: true })).toBeFocused();
  await expect(page.getByLabel("Idioma")).toHaveValue("es");
  await expect(page.getByLabel("Apariencia")).toHaveValue("dark");
  await page.goForward();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

for (const theme of ["light", "dark"] as const) {
  for (const path of ["/", "/preferences", "/unknown"]) {
    test(`${theme} route ${path} passes axe and forced-color focus`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto(`/#${path}`);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
      await page.getByRole("link", { name: "Home", exact: true }).focus();
      await expect(page.getByRole("link", { name: "Home", exact: true })).toHaveCSS(
        "outline-style",
        "solid",
      );
    });
  }
}

for (const width of [320, 360, 768, 1024, 1280]) {
  test(`shell remains usable at ${width}px with German and 200% text`, async ({ page }) => {
    await page.setViewportSize({ width, height: 500 });
    await page.goto("/#/preferences");
    await page.getByLabel("Language").selectOption("de");
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await expect(page.getByRole("link", { name: "Einstellungen", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const link = page.getByRole("link", { name: "Startseite", exact: true });
    const box = await link.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await link.click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Windwatcher");
    await page.goBack();
    await expect(page.locator("select").first()).toHaveValue("de");
  });
}

test("nested static hosting supports hash entry, reload and recovery without rewrites", async ({
  page,
  request,
}) => {
  const failures: string[] = [];
  page.on("requestfailed", (r) => failures.push(r.url()));
  page.on("response", (r) => {
    if (r.status() >= 400) failures.push(r.url());
  });
  await page.goto("http://127.0.0.1:4176/client/#/preferences");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Preferences");
  await page.reload();
  await expect(page.getByLabel("Language")).toBeVisible();
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await expect(page.locator("main img")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(await page.locator("main img").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(
    543,
  );
  await page.goBack();
  await expect(page.getByLabel("Language")).toBeVisible();
  await page.goto("http://127.0.0.1:4176/client/#/unknown");
  await page.getByRole("link", { name: "Return to Home" }).click();
  await expect(page).toHaveURL(/#\/$/);
  expect((await request.get("http://127.0.0.1:4176/client/preferences")).status()).toBe(404);
  expect(failures).toEqual([]);
});
