import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, expectTypeOf, it } from "vitest";
import snapshot from "../../../contracts/windwatcher-v1.openapi.json";
import provenance from "../../../contracts/provenance.json";
import type { components, paths } from "./schema.generated";
import { assertGeneratedTypes } from "../../../scripts/api-output";

describe("pinned server contract", () => {
  it("detects stale output without modifying either input", () => {
    const actual = "old types";
    const expected = "generated types";
    expect(() => assertGeneratedTypes(actual, expected)).toThrow("API types are stale");
    expect(() => assertGeneratedTypes(expected, expected)).not.toThrow();
    expect(actual).toBe("old types");
  });
  it("is the documented server 0.1.1 OpenAPI 3.1 snapshot", () => {
    expect(snapshot.openapi).toBe("3.1.0");
    expect(snapshot.info.version).toBe("0.1.1");
    expect(provenance.commit).toBe("d83d5d9210ccd35b0c29f03ad678b42644c1d196");
    const source = readFileSync("contracts/windwatcher-v1.openapi.json");
    expect(createHash("sha256").update(source).digest("hex")).toBe(provenance.sha256);
  });

  it("generates critical endpoints and DTOs without handwritten substitutes", () => {
    expectTypeOf<paths["/v1/instance"]["get"]>().not.toBeNever();
    expectTypeOf<
      components["schemas"]["InstanceResponse"]["service"]
    >().toEqualTypeOf<"windwatcher">();
    expectTypeOf<components["schemas"]["ProblemDetails"]["code"]>().toBeString();
    expectTypeOf<components["schemas"]["SessionGrantResponse"]>().not.toBeNever();
    expectTypeOf<components["schemas"]["PageResponse_MessageResponse"]>().not.toBeNever();
    expectTypeOf<components["schemas"]["MessageResponse"]>().not.toBeNever();
    for (const name of [
      "InstanceResponse",
      "ProblemDetails",
      "SessionGrantResponse",
      "PageResponse_MessageResponse",
      "MessageResponse",
    ]) {
      expect(snapshot.components.schemas).toHaveProperty(name);
    }
  });
});
