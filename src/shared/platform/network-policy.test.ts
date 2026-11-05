import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import capability from "../../../src-tauri/capabilities/main.json";
import config from "../../../src-tauri/tauri.conf.json";
import androidNavigation from "../../../src-tauri/capabilities/android-navigation.json";

describe("native security configuration", () => {
  it("limits Back lifecycle and exit permissions to Android", () => {
    expect(androidNavigation.platforms).toEqual(["android"]);
    expect(androidNavigation.windows).toEqual(["main"]);
    expect(androidNavigation.permissions).toEqual([
      "core:app:allow-register-listener",
      "core:app:allow-remove-listener",
      "core:app:allow-exit",
    ]);
    expect(androidNavigation).not.toHaveProperty("remote");
  });
  it("grants only scoped HTTP to the local main window", () => {
    expect(capability.windows).toEqual(["main"]);
    expect(capability.permissions).toEqual([
      {
        identifier: "http:default",
        allow: [{ url: "http://*:*/*" }, { url: "https://*:*/*" }],
      },
    ]);
    expect(capability).not.toHaveProperty("remote");
    expect(config.plugins.http.scopeRedirects).toBe(true);
    expect(config.app.security.csp).not.toContain("connect-src http:");
    expect(config.app.security.csp).not.toContain("unsafe-inline");
  });
  it("disables native cookie, dangerous TLS, unsafe-header and tracing features", () => {
    const manifest = readFileSync("src-tauri/Cargo.toml", "utf8");
    const http = /^tauri-plugin-http\s*=\s*\{([^}]+)\}/m.exec(manifest)?.[1];
    expect(http).toContain('version = "=2.8.3"');
    expect(http).toContain("default-features = false");
    const features = /features\s*=\s*\[([^\]]+)\]/.exec(http ?? "")?.[1];
    expect(Array.from((features ?? "").matchAll(/"([^"]+)"/g), (match) => match[1])).toEqual([
      "rustls-tls",
      "http2",
    ]);
  });
  it("uses one explicit Android HTTP policy, without a debug-only override", () => {
    const manifest = readFileSync("src-tauri/gen/android/app/src/main/AndroidManifest.xml", "utf8");
    const gradle = readFileSync("src-tauri/gen/android/app/build.gradle.kts", "utf8");
    expect(manifest).toContain('android:usesCleartextTraffic="true"');
    expect(manifest).not.toContain("networkSecurityConfig");
    expect(gradle).not.toContain("usesCleartextTraffic");
  });
});
