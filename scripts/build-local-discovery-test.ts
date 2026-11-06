import { resolve } from "node:path";
import { build, mergeConfig } from "vite";
import config from "../vite.config";

// These aliases exist only in this disposable UI fixture; normal builds never use them.
await build(
  mergeConfig(config, {
    root: "tests/local-discovery",
    publicDir: "../../public",
    resolve: {
      alias: [
        {
          find: /.*shared\/platform\/(http|native-target)$/,
          replacement: resolve("tests/local-discovery/platform.ts"),
        },
      ],
    },
    build: { outDir: "../../dist-local-discovery", emptyOutDir: true },
  }),
);
