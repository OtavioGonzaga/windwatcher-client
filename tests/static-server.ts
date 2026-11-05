import { resolve, sep } from "node:path";

const root = resolve("dist");
Bun.serve({
  hostname: "127.0.0.1",
  port: 4176,
  async fetch(request) {
    const path = decodeURIComponent(new URL(request.url).pathname);
    if (!path.startsWith("/client/")) return new Response("Not found", { status: 404 });
    const target = resolve(root, path.slice("/client/".length) || "index.html");
    if (!target.startsWith(root + sep)) return new Response("Not found", { status: 404 });
    const file = Bun.file(target);
    return (await file.exists()) ? new Response(file) : new Response("Not found", { status: 404 });
  },
});
