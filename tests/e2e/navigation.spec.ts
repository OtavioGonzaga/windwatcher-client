import { expect, test } from "@playwright/test";

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
