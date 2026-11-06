import { expect, test } from "@playwright/test";

for (const path of ["/#/connect", "http://127.0.0.1:4176/client/#/connect"]) {
  test(`ordinary browser never probes loopback on ${path}`, async ({ page }) => {
    const requests: string[] = [];
    await page.route(/http:\/\/(127\.0\.0\.1|\[::1\]):8080\//, async (route) => {
      requests.push(route.request().url());
      await route.abort();
    });
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Add server" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Local server suggestions" })).toHaveCount(0);
    await page.getByRole("textbox", { name: "Server URL" }).fill("https://manual.example");
    await page.reload();
    await expect(page.getByRole("textbox", { name: "Server URL" })).toHaveValue("");
    expect(requests).toEqual([]);
  });
}
