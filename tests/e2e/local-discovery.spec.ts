import { expect, test } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";

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

for (const theme of ["light", "dark"] as const) {
  test(`isolated local suggestion supports German, narrow text, keyboard and ${theme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto("http://127.0.0.1:4178/#/preferences");
    await page.getByLabel("Language").selectOption("de");
    await page.getByRole("link", { name: "Startseite" }).click();
    await page.getByRole("link", { name: "Server hinzufügen" }).click();
    await expect(page.getByRole("button", { name: /Diese Adresse verwenden:/ })).toHaveCount(2);
    await expect(
      page.getByRole("button", {
        name: "Diese Adresse verwenden: http://127.0.0.1:8080/",
        exact: true,
      }),
    ).toBeVisible();
    for (const width of [320, 360, 768, 1280]) {
      // One viewport must settle before measuring it and moving to the next.
      // oxlint-disable-next-line no-await-in-loop
      await page.setViewportSize({ width, height: 800 });
      // oxlint-disable-next-line no-await-in-loop
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      // oxlint-disable-next-line no-await-in-loop
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
    const use = page.getByRole("button", {
      name: "Diese Adresse verwenden: http://[::1]:8080/",
      exact: true,
    });
    await use.focus();
    await page.keyboard.press("Enter");
    const input = page.getByRole("textbox", { name: "Server-URL" });
    await expect(input).toHaveValue("http://[::1]:8080/");
    await expect(input).toBeFocused();
    await page.getByRole("button", { name: "Erneut prüfen" }).click();
    await expect(page.getByRole("button", { name: /Diese Adresse verwenden:/ })).toHaveCount(2);
    await page.getByRole("button", { name: "Verwerfen" }).click();
    await expect(page.getByRole("button", { name: "Erneut prüfen" })).toBeFocused();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}
