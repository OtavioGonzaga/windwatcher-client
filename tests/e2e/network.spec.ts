import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("http://127.0.0.1:4174/tests/network/index.html");
  await page.waitForFunction(() => typeof window.networkProbe === "function");
});

test("instance rejects asynchronous acceptance and bounded chunked-body overflow", async ({
  page,
}) => {
  expect(
    await page.evaluate(() => window.networkProbe("http://127.0.0.1:4318/accepted/")),
  ).toMatchObject({ ok: false, category: "invalid-response", metadata: { status: 202 } });
  expect(
    await page.evaluate(() => window.networkProbe("http://127.0.0.1:4318/oversized/")),
  ).toMatchObject({ ok: false, category: "response-too-large", metadata: { status: 200 } });
});

test("instance retains compatible future capability advertisements", async ({ page }) => {
  expect(
    await page.evaluate(() => window.networkProbe("http://127.0.0.1:4318/future/")),
  ).toMatchObject({
    ok: true,
    data: { api_versions: ["v1", "v2"], auth_methods: ["password", "passkey"] },
  });
});

test("production CSP permits controlled CORS requests through the browser adapter", async ({
  page,
}) => {
  const response = await page.evaluate(() => window.networkProbe("http://127.0.0.1:4318/proxy/"));
  expect(response).toMatchObject({ ok: true, data: { service: "windwatcher" } });
  const csp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute("content");
  expect(csp).toContain("connect-src 'self' http: https:");
});

test("browser CORS denial remains an opaque transport failure", async ({ page }) => {
  expect(
    await page.evaluate(() => window.networkProbe("http://127.0.0.1:4318/denied/")),
  ).toMatchObject({ ok: false, category: "transport" });
});

test("manual redirect refuses foreign origin without forwarding a bearer", async ({
  page,
  request,
}) => {
  const before = await (await request.get("http://127.0.0.1:4319/counts")).json();
  expect(
    await page.evaluate(() =>
      window.networkProbe("http://127.0.0.1:4318/redirect/", "fixture-only"),
    ),
  ).toMatchObject({ ok: false, category: "redirect" });
  const after = await (await request.get("http://127.0.0.1:4319/counts")).json();
  expect(after).toEqual(before);
});

test("browser omits ambient cookies but carries explicit bearer credentials", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "ambient", value: "must-not-leak", url: "http://127.0.0.1:4318" },
  ]);
  expect(
    await page.evaluate(() => window.networkProbe("http://127.0.0.1:4318/cookie/", "fixture-only")),
  ).toMatchObject({ ok: true, data: { cookie: null, authorization: "Bearer fixture-only" } });
});

test("normal production output does not expose the diagnostic harness", async ({ request }) => {
  const response = await request.get("/tests/network/index.html");
  expect(await response.text()).not.toContain("harness.ts");
  expect(await response.text()).not.toContain("Network test harness");
});
