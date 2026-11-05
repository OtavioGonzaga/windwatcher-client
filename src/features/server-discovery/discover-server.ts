import { ApiClient } from "../../shared/api/client";
import { ApiError } from "../../shared/api/error";
import type { HttpTransport } from "../../shared/api/transport";
import type { InstanceAdvertisement } from "../../shared/api/validation";

export type DiscoveryResult =
  | { kind: "supported"; root: string; metadata: InstanceAdvertisement }
  | { kind: "wrong-service" | "unsupported-api" | "unsupported-auth"; root: string }
  | { kind: "legacy"; root: string; recognized: boolean };

/** One explicit user-directed inspection. No credentials, retries, or writes. */
export async function discoverServer(
  root: string,
  transport: HttpTransport,
  signal: AbortSignal,
): Promise<DiscoveryResult> {
  const client = new ApiClient({ baseUrl: root, transport });
  const deadline = Date.now() + 15_000;
  const inspected = await client.inspectInstance({ signal, timeoutMs: 15_000 });
  if (inspected.kind === "metadata") {
    const metadata = inspected.metadata;
    if (metadata.service !== "windwatcher") return { kind: "wrong-service", root };
    if (!metadata.api_versions.includes("v1")) return { kind: "unsupported-api", root };
    if (!metadata.auth_methods.includes("password")) return { kind: "unsupported-auth", root };
    return { kind: "supported", root, metadata };
  }
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new ApiError("timeout");
  try {
    await client.request({
      method: "GET",
      path: ["users", "me"],
      expectedStatuses: [200],
      decode: () => null,
      signal,
      timeoutMs: remaining,
    });
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    if (
      error.category === "http" &&
      error.metadata.status === 401 &&
      error.metadata.code === "auth.invalid_access_token"
    ) {
      return { kind: "legacy", root, recognized: true };
    }
    if (
      (error.category === "http" || error.category === "invalid-response") &&
      error.metadata.status === 404
    ) {
      return { kind: "legacy", root, recognized: false };
    }
    throw error;
  }
  return { kind: "legacy", root, recognized: false };
}
