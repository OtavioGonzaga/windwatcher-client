import process from "node:process";

/* oxlint-disable no-await-in-loop -- Poll a single fixture report in order, not concurrent independent work. */

const required = [
  "native-http-without-cors",
  "reverse-proxy-prefix",
  "redirect-refused",
  "cookie-jar-disabled",
  "deadline-cancels-io",
  "caller-cancels-io",
  "invalid-tls-refused",
];
const deadline = Date.now() + 40000;
while (Date.now() < deadline) {
  const result = await (await fetch("http://127.0.0.1:4318/results")).json();
  if (result.report) {
    if (
      result.report.adapter !== "tauri" ||
      !Array.isArray(result.report.checks) ||
      !required.every((name) =>
        result.report.checks.some(
          (check: { name: string; passed: boolean }) => check.name === name && check.passed,
        ),
      ) ||
      !result.report.checks.every((check: { passed: boolean }) => check.passed) ||
      !result.tlsEnabled ||
      result.cancelled < 2 ||
      result.foreignHits !== 0 ||
      result.invalidTlsHits !== 0
    ) {
      throw new Error("Native smoke failed; inspect the secret-free /results fixture report.");
    }
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }
  await Bun.sleep(250);
}
throw new Error("Native smoke did not report within 40 seconds.");
