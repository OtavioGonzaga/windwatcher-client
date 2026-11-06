import { expect, test } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";

test("manual discovery validates input and shows truthful open and closed registration", async ({
  page,
}) => {
  let requests = 0;
  await page.route("https://example.test/**", async (route) => {
    requests++;
    await route.fulfill({
      json: {
        service: "windwatcher",
        api_versions: ["v1", "v2"],
        auth_methods: ["password", "future"],
        registration: requests === 1 ? "open" : "closed",
      },
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  });
  await page.goto("/");
  await page.getByRole("link", { name: "Add server" }).click();
  const input = page.getByRole("textbox", { name: "Server URL" });
  await input.fill("https://example.test/proxy/");
  await expect(
    page.getByText("https://example.test/proxy/v1/instance", { exact: false }),
  ).toBeVisible();
  expect(requests).toBe(0);
  await page.getByRole("button", { name: "Check server" }).click();
  await expect(page.getByText(/Self-registration is advertised as open/)).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Check server" }).click();
  await expect(page.getByText(/Self-registration is closed/)).toBeVisible();
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
});

test("legacy absence is never called verified and requires explicit acknowledgment", async ({
  page,
}) => {
  await page.route("https://example.test/**", async (route) => {
    await route.fulfill({
      status: 404,
      body: "Not found",
      headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "text/plain" },
    });
  });
  await page.goto("/#/connect");
  await page.getByRole("textbox", { name: "Server URL" }).fill("https://example.test");
  await page.getByRole("button", { name: "Check server" }).click();
  await expect(page.getByText(/cannot be confirmed/)).toBeVisible();
  await expect(page.getByText(/Login and registration may be available/)).not.toBeVisible();
  await page.getByRole("checkbox").check();
  await expect(page.getByText(/Login and registration may be available/)).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("nested static hosting supports direct connect route", async ({ page }) => {
  await page.goto("http://127.0.0.1:4176/client/#/connect");
  await expect(page.getByRole("heading", { name: "Add server" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Server URL" })).toBeVisible();
});

test("browser enforces real cross-origin CORS responses", async ({ page }) => {
  await page.goto("/#/connect");
  const input = page.getByRole("textbox", { name: "Server URL" });
  await input.fill("http://127.0.0.1:4318/pr5-allowed");
  await page.getByRole("button", { name: "Check server" }).click();
  await expect(page.getByText(/Self-registration is closed/)).toBeVisible();
  await input.fill("http://127.0.0.1:4318/pr5-denied");
  await page.getByRole("button", { name: "Check server" }).click();
  await expect(page.getByText(/The request failed/)).toBeVisible();
  await expect(page.getByText(/Self-registration is closed/)).not.toBeVisible();
});

test("invalid input, unsupported metadata and failure preserve accessibility", async ({ page }) => {
  await page.route("https://example.test/**", async (route) => {
    await route.fulfill({
      json: {
        service: "windwatcher",
        api_versions: ["v2"],
        auth_methods: ["password"],
        registration: "closed",
      },
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  });
  await page.goto("/#/connect");
  const input = page.getByRole("textbox", { name: "Server URL" });
  await input.fill("https://example.test/v1");
  await input.press("Enter");
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute("aria-invalid", "true");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await input.fill("https://example.test");
  await input.press("Enter");
  await expect(page.getByText(/does not advertise the supported v1 API/)).toBeVisible();
  await expect(page.getByText("v2", { exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("German discovery remains usable at narrow width and enlarged text", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 600 });
  await page.goto("/#/preferences");
  await page.getByLabel("Language").selectOption("de");
  await page.getByRole("link", { name: "Startseite" }).click();
  await page.getByRole("link", { name: "Server hinzufügen" }).click();
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await expect(page.getByRole("heading", { name: "Server hinzufügen" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
