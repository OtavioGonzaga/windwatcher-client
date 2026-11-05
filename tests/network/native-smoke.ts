import { ApiClient } from "../../src/shared/api/client";
import { ApiError } from "../../src/shared/api/error";
import { browserHttp } from "../../src/shared/platform/browser-http";
import { platformHttp } from "../../src/shared/platform/http";

/** Runs only in the explicitly built/selected native test entry. */
export async function nativeSmoke() {
  const transport = await platformHttp();
  if (transport === browserHttp)
    throw new Error("Native smoke requires the installed Tauri adapter.");
  const checks: { name: string; passed: boolean }[] = [];
  const check = async (name: string, run: () => Promise<boolean>) => {
    try {
      checks.push({ name, passed: await run() });
    } catch {
      checks.push({ name, passed: false });
    }
  };
  const client = (prefix: string) =>
    new ApiClient({ baseUrl: `http://127.0.0.1:4318/${prefix}/`, transport });
  await check("unexpected-success-refused", async () => {
    try {
      await client("accepted").getInstance();
    } catch (error) {
      return (
        error instanceof ApiError &&
        error.category === "invalid-response" &&
        error.metadata.status === 202
      );
    }
    return false;
  });
  await check("future-capabilities-preserved", async () => {
    const metadata = await client("future").getInstance();
    return metadata.api_versions.includes("v2") && metadata.auth_methods.includes("passkey");
  });
  await check("oversized-instance-refused", async () => {
    try {
      await client("oversized").getInstance();
    } catch (error) {
      return (
        error instanceof ApiError &&
        error.category === "response-too-large" &&
        error.metadata.status === 200
      );
    }
    return false;
  });
  await check(
    "native-no-content",
    async () =>
      (await client("empty").request({
        method: "DELETE",
        expectedStatus: 204,
        path: ["fixture"],
        response: "empty",
      })) === undefined,
  );
  await check(
    "native-http-without-cors",
    async () => (await client("denied").getInstance()).service === "windwatcher",
  );
  await check(
    "reverse-proxy-prefix",
    async () => (await client("proxy").getInstance()).service === "windwatcher",
  );
  await check("redirect-refused", async () => {
    try {
      await client("redirect").request({
        method: "GET",
        expectedStatus: 200,
        path: ["instance"],
        accessToken: "fixture-only",
        decode: (value) => value,
      });
    } catch (error) {
      return error instanceof ApiError && error.category === "redirect";
    }
    return false;
  });
  await check("cookie-jar-disabled", async () => {
    const first = await transport(new URL("http://127.0.0.1:4318/set-cookie"), {
      method: "GET",
      headers: new Headers(),
      signal: new AbortController().signal,
    });
    await first.text();
    const result = await client("cookie").request({
      method: "GET",
      expectedStatus: 200,
      path: ["instance"],
      accessToken: "fixture-only",
      decode: (value) => value,
    });
    return (
      typeof result === "object" &&
      result !== null &&
      "cookie" in result &&
      result.cookie === null &&
      "authorization" in result &&
      result.authorization === "Bearer fixture-only"
    );
  });
  await check("deadline-cancels-io", async () => {
    try {
      await client("slow").getInstance({ timeoutMs: 100 });
    } catch (error) {
      return error instanceof ApiError && error.category === "timeout";
    }
    return false;
  });
  await check("caller-cancels-io", async () => {
    const controller = new AbortController();
    const pending = client("slow").getInstance({ signal: controller.signal });
    const timer = setTimeout(() => controller.abort(), 100);
    try {
      await pending;
    } catch (error) {
      return error instanceof ApiError && error.category === "cancelled";
    } finally {
      clearTimeout(timer);
    }
    return false;
  });
  await check("invalid-tls-refused", async () => {
    try {
      await new ApiClient({ baseUrl: "https://127.0.0.1:4320/proxy/", transport }).getInstance();
    } catch (error) {
      return error instanceof ApiError && error.category === "transport";
    }
    return false;
  });
  // Optional Internet-dependent TLS evidence. Ordinary automated checks stay offline.
  if (new URL(location.href).searchParams.has("public-https")) {
    await check("valid-public-https", async () => {
      const response = await transport(new URL("https://example.com/"), {
        method: "GET",
        headers: new Headers(),
        signal: AbortSignal.timeout(15000),
      });
      await response.text();
      return response.status === 200;
    });
  }
  const report = { adapter: "tauri", checks };
  const response = await transport(new URL("http://127.0.0.1:4318/results"), {
    method: "POST",
    headers: new Headers({ "Content-Type": "application/json" }),
    body: JSON.stringify(report),
    signal: AbortSignal.timeout(5000),
  });
  await response.text();
  document.body.textContent = checks.every((item) => item.passed)
    ? "Native network smoke passed."
    : "Native network smoke FAILED.";
  return report;
}
