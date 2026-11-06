import { readBoundedText } from "../../shared/api/body";
import { ApiError } from "../../shared/api/error";
import type { FailureCategory } from "../../shared/api/error";
import type { HttpTransport } from "../../shared/api/transport";
import { ServerUrl } from "../../shared/api/url";
import { discoverServer } from "./discover-server";

const LINUX_LOOPBACK_ROOTS = Object.freeze([
  "http://127.0.0.1:8080/",
  "http://[::1]:8080/",
] as const);
export type LocalCandidate = {
  root: string;
} & (
  | { kind: "supported"; readiness: "ready" | "not-ready" | "unknown" }
  | { kind: "legacy" }
  | { kind: "wrong-service" | "unsupported-api" | "unsupported-auth" | "unknown" }
  | { kind: "failed"; category: FailureCategory }
);

/** Bound the whole operation, including non-cooperative transports and body reads. */
async function bounded<T>(
  parent: AbortSignal,
  milliseconds: number,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let rejectAbort: (error: ApiError) => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  const abort = (category: "timeout" | "cancelled") => {
    if (controller.signal.aborted) return;
    rejectAbort(new ApiError(category));
    controller.abort();
  };
  const onAbort = () => abort("cancelled");
  parent.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => abort("timeout"), Math.max(0, milliseconds));
  if (parent.aborted) onAbort();
  try {
    return await Promise.race([
      aborted,
      Promise.resolve().then(() => {
        if (controller.signal.aborted) throw new ApiError("cancelled");
        return operation(controller.signal);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    parent.removeEventListener("abort", onAbort);
    controller.abort();
  }
}

async function readiness(root: string, transport: HttpTransport, signal: AbortSignal) {
  const response = await transport(new URL("health/ready", root), {
    method: "GET",
    headers: new Headers({ Accept: "application/json" }),
    signal,
  });
  if (signal.aborted) {
    void response.body?.cancel().catch(() => {});
    throw new ApiError("cancelled");
  }
  // Even unsuccessful bodies are bounded. Operational 503 is not Problem Details.
  const text = await readBoundedText(response, 4096, signal, {});
  if (signal.aborted) throw new ApiError("cancelled");
  const media = response.headers.get("Content-Type")?.split(";")[0]?.trim().toLowerCase();
  if (response.type === "opaqueredirect" || media !== "application/json") return "unknown";
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return "unknown";
  }
  if (typeof value !== "object" || value === null || !("status" in value)) return "unknown";
  if (response.status === 200 && value.status === "ready") return "ready";
  if (response.status === 503 && value.status === "not_ready") return "not-ready";
  return "unknown";
}

/** One page-local scan. Two independent origins; no retries, persistence or polling. */
export async function discoverLocalServers(
  transport: HttpTransport,
  signal: AbortSignal,
  onCandidate: (candidate: LocalCandidate) => void,
): Promise<readonly LocalCandidate[]> {
  return bounded(signal, 8000, async (scanSignal) => {
    const deadline = Date.now() + 8000;
    const budget = () => Math.min(3000, Math.max(0, deadline - Date.now()));
    return Promise.all(
      LINUX_LOOPBACK_ROOTS.map(async (address): Promise<LocalCandidate> => {
        const root = ServerUrl.parse(address).toString();
        let candidate: LocalCandidate;
        try {
          const result = await bounded(scanSignal, budget(), (inspectionSignal) =>
            discoverServer(root, transport, inspectionSignal),
          );
          if (scanSignal.aborted) throw new ApiError("cancelled");
          if (result.kind === "supported") {
            let health: "ready" | "not-ready" | "unknown" = "unknown";
            try {
              health = await bounded(scanSignal, budget(), (healthSignal) =>
                readiness(root, transport, healthSignal),
              );
            } catch {
              /* Recognized protocol, but no authoritative readiness evidence. */
            }
            candidate = { root, kind: "supported", readiness: health };
          } else if (result.kind === "legacy") {
            candidate = { root, kind: result.recognized ? "legacy" : "unknown" };
          } else {
            candidate = { root, kind: result.kind };
          }
        } catch (error) {
          candidate = {
            root,
            kind: "failed",
            category: error instanceof ApiError ? error.category : "transport",
          };
        }
        if (!scanSignal.aborted) onCandidate(candidate);
        return candidate;
      }),
    );
  });
}
