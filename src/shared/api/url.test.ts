import { describe, expect, it } from "vitest";
import { apiUrl, ServerUrl } from "./url";

describe("server roots", () => {
  it.each([
    ["https://example.test", "https://example.test/v1/instance"],
    ["http://example.test:8080/proxy", "http://example.test:8080/proxy/v1/instance"],
    ["https://example.test/proxy/", "https://example.test/proxy/v1/instance"],
    ["http://127.0.0.1:9000/", "http://127.0.0.1:9000/v1/instance"],
    ["http://[::1]:9000/prefix/", "http://[::1]:9000/prefix/v1/instance"],
    ["https://münich.test/a%20b/", "https://xn--mnich-kva.test/a%20b/v1/instance"],
  ])("resolves %s without losing the prefix", (input, expected) => {
    expect(apiUrl(ServerUrl.parse(input), ["instance"]).href).toBe(expected);
  });

  it.each([
    "example.test",
    "https:/example.test",
    "https:///example.test",
    "file:///tmp/x",
    "https://u:p@example.test",
    "http://@example.test",
    "https://example.test?",
    "https://example.test#",
    "https://example.test/a/../b",
    "https://example.test/%2e%2E/",
    "https://example.test/a\\b",
    "https://example.test/%252e%252e/",
    "https://example.test/a%2fb",
    "https://example.test/%00",
    "https://example.test/%zz",
    "https://example.test//x",
    "https://example.test/v1/",
    "https://example.test/%761",
    " https://example.test",
    "https://example.test\n",
    "http://[::1",
  ])("rejects ambiguous or unsafe root %s", (input) => {
    expect(() => ServerUrl.parse(input)).toThrow(TypeError);
  });

  it("encodes segments and query values without changing the origin or prefix", () => {
    const base = ServerUrl.parse("https://example.test/proxy/");
    const result = apiUrl(base, ["users", "a/b?#"], { cursor: "a+/=&" });
    expect(result.pathname).toBe("/proxy/v1/users/a%2Fb%3F%23");
    expect(result.searchParams.get("cursor")).toBe("a+/=&");
    result.hostname = "foreign.test";
    expect(base.toString()).toBe("https://example.test/proxy/");
    expect(() => apiUrl(base, [".."])).toThrow(TypeError);
  });
});
