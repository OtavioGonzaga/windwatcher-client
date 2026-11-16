import { instance } from "../fixtures/instance";

let report: unknown = null;
let cancelled = 0;
let invalidTlsHits = 0;

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
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Idempotency-Key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Expose-Headers": "X-Request-Id, Retry-After",
};
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 4318,
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/key-denied/v1/conversations" && request.method === "OPTIONS")
      return new Response(null, {
        status: 204,
        headers: { ...cors, "Access-Control-Allow-Headers": "Authorization, Content-Type" },
      });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (path === "/key/v1/conversations") {
      const body = await request.json();
      if (
        request.headers.get("Idempotency-Key") !== "fixture-only-key" ||
        JSON.stringify(body) !==
          JSON.stringify({ kind: "direct", participant_id: "019a0000-0000-7000-8000-000000000001" })
      )
        return new Response(null, { status: 400, headers: cors });
      return Response.json(
        {
          id: "019a0000-0000-7000-8000-000000000011",
          kind: "direct",
          title: "Fixture Direct",
          created_at: "2026-11-06T12:00:00Z",
          updated_at: "2026-11-06T12:00:00Z",
          membership: { role: "direct" },
          unread_count: 0,
        },
        { status: 201, headers: cors },
      );
    }
    if (path === "/ready") return new Response("ready");
    if (path === "/pr5-allowed/v1/instance")
      return Response.json(instance, {
        headers: { "Access-Control-Allow-Origin": "http://127.0.0.1:4173" },
      });
    if (path === "/pr5-denied/v1/instance") return Response.json(instance);
    if (path === "/accepted/v1/instance")
      return Response.json(instance, { status: 202, headers: cors });
    if (path === "/future/v1/instance")
      return Response.json(
        {
          ...instance,
          api_versions: ["v1", "v2"],
          auth_methods: ["password", "passkey"],
        },
        { headers: cors },
      );
    if (path === "/oversized/v1/instance") {
      const bytes = new TextEncoder().encode(
        JSON.stringify({ ...instance, extension: "x".repeat(70000) }),
      );
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(bytes.slice(0, 50000));
            controller.enqueue(bytes.slice(50000));
            controller.close();
          },
        }),
        { headers: { ...cors, "Content-Type": "application/json" } },
      );
    }
    if (path === "/empty/v1/fixture") return new Response(null, { status: 204 });
    if (path === "/results") {
      if (request.method === "DELETE") {
        report = null;
        cancelled = 0;
        foreignHits = 0;
        invalidTlsHits = 0;
      }
      if (request.method === "POST") report = await request.json();
      return Response.json(
        {
          report,
          cancelled,
          foreignHits,
          invalidTlsHits,
          tlsEnabled: Boolean(
            process.env.WINDWATCHER_TEST_TLS_CERT && process.env.WINDWATCHER_TEST_TLS_KEY,
          ),
        },
        { headers: cors },
      );
    }
    if (path === "/set-cookie")
      return new Response("cookie fixture", {
        headers: { "Set-Cookie": "native-ambient=must-not-leak; Path=/" },
      });
    if (path === "/slow/v1/instance") {
      request.signal.addEventListener(
        "abort",
        () => {
          cancelled++;
        },
        { once: true },
      );
      await Bun.sleep(3000);
      return Response.json(instance);
    }
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
if (process.env.WINDWATCHER_TEST_TLS_CERT && process.env.WINDWATCHER_TEST_TLS_KEY) {
  Bun.serve({
    hostname: "127.0.0.1",
    port: 4320,
    tls: {
      cert: Bun.file(process.env.WINDWATCHER_TEST_TLS_CERT),
      key: Bun.file(process.env.WINDWATCHER_TEST_TLS_KEY),
    },
    fetch() {
      invalidTlsHits++;
      return Response.json(instance);
    },
  });
}
console.log(`Network fixtures listening on ${server.port} and ${foreign.port}.`);
