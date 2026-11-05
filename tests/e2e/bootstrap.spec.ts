import { expect, test } from "@playwright/test";

test("production frontend boots with intact artwork and no runtime errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("/");
  await expect(page).toHaveTitle("Windwatcher");
  await expect(page.getByRole("heading", { name: "Windwatcher", level: 1 })).toBeAttached();
  const image = page.locator("main img");
  await expect(image).toBeVisible();
  expect(await image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(543);
  expect(await page.locator("body").evaluate((body) => body.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await expect(page.getByRole("main")).toHaveCSS("background-color", "rgb(29, 32, 33)");
  expect(errors).toEqual([]);
});
