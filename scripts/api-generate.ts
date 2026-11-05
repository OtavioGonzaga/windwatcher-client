import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { assertGeneratedTypes } from "./api-output";

const root = new URL("../", import.meta.url);
const snapshot = new URL("contracts/windwatcher-v1.openapi.json", root);
const output = new URL("src/shared/api/schema.generated.ts", root);
const provenance = JSON.parse(await readFile(new URL("contracts/provenance.json", root), "utf8"));
const source = await readFile(snapshot, "utf8");
if (createHash("sha256").update(source).digest("hex") !== provenance.sha256) {
  throw new Error("Contract checksum differs from contracts/provenance.json.");
}
const document = JSON.parse(source);
if (document.openapi !== "3.1.0" || document.info?.version !== "0.1.1") {
  throw new Error("Expected the released server 0.1.1 OpenAPI 3.1.0 contract.");
}
// No remote refs are permitted, including ones a generator might otherwise fetch.
function checkRefs(value: unknown): void {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (key === "$ref" && (typeof child !== "string" || !child.startsWith("#/"))) {
      throw new Error("Only local contract references are permitted.");
    }
    checkRefs(child);
  }
}
checkRefs(document);
const { default: openapiTS, astToString } = await import("openapi-typescript");
const generated = astToString(await openapiTS(document, { alphabetize: true }));
const formatter = Bun.spawn(
  [process.execPath, "node_modules/oxfmt/bin/oxfmt", "--stdin-filepath", fileURLToPath(output)],
  {
    cwd: fileURLToPath(root),
    stdin: new Blob([
      "// Generated from contracts/windwatcher-v1.openapi.json. DO NOT EDIT.\n" + generated,
    ]),
    stdout: "pipe",
    stderr: "inherit",
  },
);
const formatted = await new Response(formatter.stdout).text();
if ((await formatter.exited) !== 0) throw new Error("Generated type formatting failed.");
if (process.argv.includes("--check")) {
  assertGeneratedTypes(await readFile(output, "utf8"), formatted);
} else {
  await writeFile(output, formatted);
}
