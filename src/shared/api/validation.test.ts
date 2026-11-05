import { describe, expect, expectTypeOf, it } from "vitest";
import { instance } from "../../../tests/fixtures/instance";
import type { components } from "./schema.generated";
import { decodeInstance } from "./validation";
import type { Instance } from "./validation";

describe("instance advertisements", () => {
  it("retains future capabilities without asserting them as generated v1 enums", () => {
    const advertised = {
      ...instance,
      api_versions: ["v1", "v2"],
      auth_methods: ["password", "passkey"],
      extension: true,
    };
    const decoded = decodeInstance(advertised);
    expect(decoded.api_versions).toEqual(["v1", "v2"]);
    expect(decoded.auth_methods).toEqual(["password", "passkey"]);
    expectTypeOf<Instance["api_versions"][number]>().toEqualTypeOf<string>();
    expectTypeOf<Instance["auth_methods"][number]>().toEqualTypeOf<string>();
    expectTypeOf<
      components["schemas"]["InstanceResponse"]["api_versions"][number]
    >().toEqualTypeOf<"v1">();
    expectTypeOf<
      components["schemas"]["InstanceResponse"]["auth_methods"][number]
    >().toEqualTypeOf<"password">();
    expectTypeOf<Instance["registration"]>().toEqualTypeOf<
      components["schemas"]["InstanceResponse"]["registration"]
    >();
    advertised.api_versions.push("other");
    advertised.auth_methods.push("other");
    expect(decoded.api_versions).toEqual(["v1", "v2"]);
    expect(decoded.auth_methods).toEqual(["password", "passkey"]);
  });

  it.each([
    { ...instance, api_versions: [], auth_methods: [] },
    { ...instance, api_versions: ["v2"], auth_methods: ["passkey"] },
  ])("does not turn capability presence into onboarding policy", (advertised) => {
    expect(decodeInstance(advertised)).toEqual(advertised);
  });

  it.each([
    { ...instance, api_versions: ["v1", null] },
    { ...instance, auth_methods: ["password", 1] },
    { ...instance, api_versions: "v1" },
    { ...instance, auth_methods: null },
    { ...instance, service: "foreign" },
    { ...instance, registration: "unrecognized" },
    { service: "windwatcher" },
  ])("continues rejecting invalid required metadata shapes", (value) => {
    expect(() => decodeInstance(value)).toThrow("Invalid instance metadata");
  });
});
