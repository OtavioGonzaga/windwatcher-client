import process from "node:process";
const result = Bun.spawn([process.execPath, "--bun", "vite", "build"], {
  env: { ...process.env, WINDWATCHER_SHELL_HARNESS: "1" },
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});
process.exit(await result.exited);
