// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("local presentation assets", () => {
  it("preserves the four owner-supplied artwork hashes", () => {
    const inventory = readFileSync("public/brand/README.md", "utf8");
    const entries = [...inventory.matchAll(/([a-f0-9]{64})  (windwatcher-[\w-]+\.png)/g)];
    expect(entries).toHaveLength(4);
    for (const [, hash, file] of entries) {
      expect(
        createHash("sha256")
          .update(readFileSync(`public/brand/${file}`))
          .digest("hex"),
      ).toBe(hash);
    }
  });

  it("distributes upstream font notices and the complete OFL text", () => {
    const distributed = readFileSync("public/licenses/ibm-plex-OFL.txt", "utf8");
    for (const family of ["sans", "mono"]) {
      const license = readFileSync(`node_modules/@fontsource/ibm-plex-${family}/LICENSE`, "utf8");
      expect(distributed).toContain(license.split("\n")[0]);
      expect(distributed).toContain(
        license.slice(license.indexOf("SIL OPEN FONT LICENSE Version 1.1")).trim(),
      );
    }
  });
});
