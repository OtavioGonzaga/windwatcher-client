import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: { baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure" },
  projects: [
    {
      name: "desktop-chromium",
      use: { browserName: "chromium", viewport: { width: 1280, height: 800 } },
    },
    {
      name: "mobile-chromium",
      use: {
        browserName: "chromium",
        viewport: { width: 360, height: 800 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: [
    {
      command: "bun --bun vite preview --outDir dist-local-discovery --port 4178",
      url: "http://127.0.0.1:4178/",
      reuseExistingServer: false,
    },
    {
      command: "bun --bun vite preview --outDir dist-shell --port 4177",
      url: "http://127.0.0.1:4177/",
      reuseExistingServer: false,
    },
    {
      command: "bun tests/static-server.ts",
      url: "http://127.0.0.1:4176/client/",
      reuseExistingServer: false,
    },
    {
      command: "bun --bun vite preview --outDir dist-foundation --port 4175",
      url: "http://127.0.0.1:4175/tests/foundation/index.html",
      reuseExistingServer: false,
    },
    {
      command: "bun run preview",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: false,
    },
    {
      command: "bun --bun vite preview --outDir dist-network --port 4174",
      url: "http://127.0.0.1:4174/tests/network/index.html",
      reuseExistingServer: false,
    },
    {
      command: "bun tests/network/fixture-server.ts",
      url: "http://127.0.0.1:4318/ready",
      reuseExistingServer: false,
    },
  ],
});
