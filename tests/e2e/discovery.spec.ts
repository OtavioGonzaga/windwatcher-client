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
