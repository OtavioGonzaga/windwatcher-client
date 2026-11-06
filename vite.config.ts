import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const host = process.env.TAURI_DEV_HOST;
const networkHarness = process.env.WINDWATCHER_NETWORK_HARNESS === "1";
const foundationHarness = process.env.WINDWATCHER_FOUNDATION_HARNESS === "1";
const shellHarness = process.env.WINDWATCHER_SHELL_HARNESS === "1";

export default defineConfig({
  define: {
    "import.meta.env.NATIVE_TARGET": JSON.stringify(process.env.TAURI_ENV_PLATFORM ?? "web"),
  },
  base: "./",
  ...(shellHarness ? { root: "tests/shell", publicDir: "../../public" } : {}),
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "production-content-security-policy",
      apply: "build",
      transformIndexHtml() {
        return [
          {
            tag: "meta",
            attrs: {
              "http-equiv": "Content-Security-Policy",
              content:
                "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self' http: https:; object-src 'none'; base-uri 'none'; form-action 'none'",
            },
            injectTo: "head-prepend",
          },
        ];
      },
    },
  ],
  clearScreen: false,
  build: shellHarness
    ? { outDir: "../../dist-shell", emptyOutDir: true }
    : foundationHarness
      ? { outDir: "dist-foundation", rollupOptions: { input: "tests/foundation/index.html" } }
      : networkHarness
        ? {
            outDir: "dist-network",
            rollupOptions: { input: { main: "index.html", network: "tests/network/index.html" } },
          }
        : {},
  server: {
    port: 1420,
    strictPort: true,
    host: host ?? "127.0.0.1",
    ...(host ? { hmr: { protocol: "ws" as const, host, port: 1421 } } : {}),
    watch: { ignored: ["**/src-tauri/**"] },
  },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    maxWorkers: 1,
  },
});
