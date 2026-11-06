import type { HttpTransport } from "../../src/shared/api/transport";

export const canDiscoverLocalServer = () => true;
export async function platformHttp(): Promise<HttpTransport> {
  return async (url) =>
    Response.json(
      url.pathname === "/health/ready"
        ? { status: "ready" }
        : {
            service: "windwatcher",
            api_versions: ["v1"],
            auth_methods: ["password"],
            registration: "closed",
          },
    );
}
