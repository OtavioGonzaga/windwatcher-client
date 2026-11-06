import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "vite";

// Exercise the real Vite define in emitted code, not only the gate's test seam.
const directory = await mkdtemp(join(tmpdir(), "windwatcher-target-"));
const previousTarget = process.env.TAURI_ENV_PLATFORM;
const previousNative = Reflect.get(globalThis, "isTauri");
try {
  // Builds/test batches stay sequential, including these tiny target-only bundles.
  for (const target of ["web", "linux", "windows", "android"]) {
    if (target === "web") delete process.env.TAURI_ENV_PLATFORM;
    else process.env.TAURI_ENV_PLATFORM = target;
    // oxlint-disable-next-line no-await-in-loop
    const output = await build({
      logLevel: "error",
      build: {
        write: false,
        lib: {
          entry: resolve("src/shared/platform/native-target.ts"),
          formats: ["es"],
          fileName: "gate",
        },
      },
    });
    if ("on" in output) throw new Error("Unexpected watch build.");
    const chunk = (Array.isArray(output) ? output : [output])
      .flatMap((result) => result.output)
      .find((item) => item.type === "chunk");
    if (!chunk || chunk.type !== "chunk") throw new Error("Target gate bundle missing.");
    const path = join(directory, `${target}.mjs`);
    // oxlint-disable-next-line no-await-in-loop
    await writeFile(path, chunk.code);
    // oxlint-disable-next-line no-await-in-loop
    const gate: unknown = await import(pathToFileURL(path).href);
    if (
      typeof gate !== "object" ||
      gate === null ||
      !("canDiscoverLocalServer" in gate) ||
      typeof gate.canDiscoverLocalServer !== "function"
    )
      throw new Error("Target gate export missing.");
    for (const native of [false, true]) {
      Reflect.set(globalThis, "isTauri", native);
      if (gate.canDiscoverLocalServer() !== (native && target === "linux"))
        throw new Error(`Incorrect ${target} target gate.`);
    }
    console.log(`Target gate passed: ${target} (browser and native identity).`);
  }
} finally {
  if (previousTarget === undefined) delete process.env.TAURI_ENV_PLATFORM;
  else process.env.TAURI_ENV_PLATFORM = previousTarget;
  if (previousNative === undefined) Reflect.deleteProperty(globalThis, "isTauri");
  else Reflect.set(globalThis, "isTauri", previousNative);
  await rm(directory, { recursive: true, force: true });
}
