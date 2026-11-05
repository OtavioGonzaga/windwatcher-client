import { readFileSync } from "node:fs";

for (const [variant, task] of [
  ["universalDebug", "processUniversalDebugMainManifest"],
  ["universalRelease", "processUniversalReleaseMainManifest"],
]) {
  const manifest = readFileSync(
    `src-tauri/gen/android/app/build/intermediates/merged_manifest/${variant}/${task}/AndroidManifest.xml`,
    "utf8",
  );
  const application = /<application\b[^>]*>/s.exec(manifest)?.[0];
  if (
    !application?.includes('android:usesCleartextTraffic="true"') ||
    application.includes("networkSecurityConfig")
  ) {
    throw new Error(`Unexpected ${variant} network policy; review the effective merged manifest.`);
  }
  console.log(`${variant}: cleartext enabled, no overriding Network Security Config.`);
}
