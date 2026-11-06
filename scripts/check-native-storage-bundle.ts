// Marker regression check, not a general secret scanner. Never print artifact bytes.
export {};
const nativePath = process.argv[2];
if (!nativePath || process.argv.length !== 3) {
  console.error("Usage: bun scripts/check-native-storage-bundle.ts /path/to/normal/native/binary");
  process.exit(1);
}
const markers = [
  "windwatcher-client.windows-ci.dpapi.v1",
  "Windows DPAPI real-OS capacity/restart/overwrite/isolation/corruption/crash/leak checks passed.",
  "pending-flushed",
  "operation-lock-acquired",
  "synthetic.header.signature",
];
const paths = [nativePath];
for await (const path of new Bun.Glob("**/*.{js,html,css}").scan({ cwd: "dist", absolute: true }))
  paths.push(path);
for (const path of paths) {
  // oxlint-disable-next-line no-await-in-loop -- Read build artifacts sequentially to bound memory.
  const bytes = Buffer.from(await Bun.file(path).arrayBuffer());
  if (markers.some((marker) => bytes.includes(Buffer.from(marker)))) {
    console.error("Normal native/web artifacts contain an opt-in storage fixture marker.");
    process.exit(1);
  }
}
console.log("Normal native/web artifacts exclude the checked storage fixture markers.");
