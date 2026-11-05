import { instance } from "../fixtures/instance";

const foreign = Bun.serve({
  hostname: "127.0.0.1",
  port: 4319,
  fetch(request) {
    if (new URL(request.url).pathname === "/counts") return Response.json({ foreignHits });
    foreignHits++;
    return Response.json(instance, { headers: cors });
  },
});
let foreignHits = 0;
const cors = {
  "Access-Control-Allow-Origin": "http://127.0.0.1:4174",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Expose-Headers": "X-Request-Id, Retry-After",
};
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 4318,
  fetch(request) {
    const path = new URL(request.url).pathname;
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (path === "/ready") return new Response("ready");
    if (path === "/redirect/v1/instance")
      return new Response(null, {
        status: 302,
        headers: { ...cors, Location: "http://127.0.0.1:4319/foreign" },
      });
    if (path === "/denied/v1/instance") return Response.json(instance);
    if (path === "/cookie/v1/instance")
      return Response.json(
        {
          cookie: request.headers.get("Cookie"),
          authorization: request.headers.get("Authorization"),
        },
        { headers: cors },
      );
    if (path === "/proxy/v1/instance") return Response.json(instance, { headers: cors });
    return new Response("not found", { status: 404 });
  },
});
console.log(`Network fixtures listening on ${server.port} and ${foreign.port}.`);
