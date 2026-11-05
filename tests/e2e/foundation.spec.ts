// Each step mutates the same browser page; parallel execution would race navigation and language changes.
/* oxlint-disable no-await-in-loop */
import { expect, test } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { readFileSync, readdirSync } from "node:fs";

const showcase = "http://127.0.0.1:4175/tests/foundation/index.html";
const labels = {
  en: {
    language: "Language",
    appearance: "Appearance",
    description: "A client for self-hosted messaging.",
  },
  "pt-BR": {
    language: "Idioma",
    appearance: "Aparência",
    description: "Um cliente de mensagens para servidores próprios.",
  },
  es: {
    language: "Idioma",
    appearance: "Apariencia",
    description: "Un cliente de mensajería para servidores propios.",
  },
  de: {
    language: "Sprache",
    appearance: "Erscheinungsbild",
    description: "Ein Messaging-Client für selbst gehostete Server.",
  },
};

test("all four languages switch without reload, requests or durable storage", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    document.documentElement.dataset.testMarker = "same-document";
  });
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  for (const locale of ["pt-BR", "es", "de", "en"] as const) {
    await page.locator("select").first().selectOption(locale);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.getByText(labels[locale].description, { exact: true })).toBeVisible();
    await expect(page.getByLabel(labels[locale].language)).toHaveValue(locale);
    await expect(page.getByLabel(labels[locale].appearance)).toBeVisible();
  }
  expect(await page.locator("html").getAttribute("data-test-marker")).toBe("same-document");
  expect(requests).toEqual([]);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
});

test("system theme follows OS changes, explicit mode overrides, and reload resets choices", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#1d2021");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByLabel("Appearance").selectOption("dark");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByLabel("Language").selectOption("de");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#fbf1c7");
});

for (const theme of ["light", "dark"] as const) {
  test(`${theme}: root and component fixture pass axe and visible native keyboard focus`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto("/");
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Language")).toBeFocused();
    await expect(page.getByLabel("Language")).toHaveCSS("outline-style", "solid");
    await expect(page.getByLabel("Language")).toHaveCSS("outline-width", "3px");
    await page.goto(showcase);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    const input = page.getByRole("textbox");
    await input.fill("local example");
    const reset = page.getByRole("button", { name: "Reset example", exact: true }).first();
    await expect(reset).toHaveCSS("font-size", "15px");
    await expect(reset).toHaveCSS("font-weight", "500");
    await expect(input).toHaveCSS("font-size", "15px");
    await reset.focus();
    await page.keyboard.press("Enter");
    await expect(input).toHaveValue("");
    await expect(page.getByRole("status")).toContainText("Success:");
    await input.fill("another example");
    await page.getByRole("button", { name: "Clear example input", exact: true }).first().focus();
    await page.keyboard.press("Space");
    await expect(input).toHaveValue("");
    await expect(
      page.getByRole("button", { name: "Reset example", exact: true }).last(),
    ).toBeDisabled();
  });
}

for (const width of [320, 360, 768, 1280]) {
  test(`German controls wrap at ${width}px and 200% text size`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const url of ["/", showcase]) {
      await page.goto(url);
      await page.locator("select").first().selectOption("de");
      // Test-only CSS, not application inline styles or a production CSP exception.
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      for (const select of await page.locator("select").all()) {
        const bounds = await select.boundingBox();
        expect(bounds!.width).toBeLessThanOrEqual(width - 30);
        expect(bounds!.height).toBeGreaterThanOrEqual(44);
      }
    }
  });
}

test("reduced motion and forced colors retain focus and control boundaries", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await page.goto(showcase);
  const button = page.getByRole("button", { name: "Reset example", exact: true }).first();
  await button.focus();
  await expect(button).toHaveCSS("outline-style", "solid");
  await expect(button).toHaveCSS("border-top-style", "solid");
  await expect(button).toHaveCSS("transition-duration", "0s");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("fonts and assets load locally and production output excludes fixture entry points", async ({
  page,
}) => {
  const external: string[] = [];
  const fonts: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).origin !== "http://127.0.0.1:4173") external.push(request.url());
    if (request.resourceType() === "font") fonts.push(request.url());
  });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  expect(fonts.length).toBeGreaterThan(0);
  expect(external).toEqual([]);
  const license = await page.request.get("/licenses/ibm-plex-OFL.txt");
  expect(license.ok()).toBe(true);
  expect(await license.text()).toContain("SIL OPEN FONT LICENSE Version 1.1");
  expect(
    await page.evaluate(() =>
      document.fonts.check('400 16px "IBM Plex Sans"', "ação español Grüße"),
    ),
  ).toBe(true);
  const js = readdirSync("dist/assets")
    .filter((file) => file.endsWith(".js"))
    .map((file) => readFileSync(`dist/assets/${file}`, "utf8"))
    .join("\n");
  expect(js).not.toContain("data-foundation-showcase");
  expect(js).not.toContain("networkProbe");
  expect(readdirSync("dist")).not.toContain("tests");
});
