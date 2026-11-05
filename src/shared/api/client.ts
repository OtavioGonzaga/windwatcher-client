import { ApiError, retryAfterMs } from "./error";
import { DEFAULT_MAX_RESPONSE_BYTES, MAX_METADATA_RESPONSE_BYTES, readBoundedText } from "./body";
import type { FailureMetadata } from "./error";
import type { HttpMethod, HttpTransport } from "./transport";
import { apiUrl, ServerUrl } from "./url";
import { decodeInstance, isRequestId, parseProblem } from "./validation";
import type { Instance } from "./validation";

export interface RequestLifetime {
  readonly signal?: AbortSignal | undefined;
  readonly timeoutMs?: number | undefined;
}

interface RequestOptions extends RequestLifetime {
  readonly maxResponseBytes?: number;
  readonly method: HttpMethod;
  readonly path: readonly string[];
  readonly query?: Readonly<Record<string, string>>;
  readonly accessToken?: string;
  readonly body?: unknown;
}
type JsonRequest<T> = RequestOptions & {
  readonly expectedStatuses: readonly [200 | 201, ...(200 | 201)[]];
  readonly decode: (value: unknown) => T;
};
type EmptyRequest = RequestOptions & {
  readonly expectedStatuses: readonly [204];
  readonly response: "empty";
};

/** A server-bound client; credentials and request lifetime are never global. */
export class ApiClient {
  readonly #base: ServerUrl;
  readonly #transport: HttpTransport;

  constructor(context: { readonly baseUrl: string; readonly transport: HttpTransport }) {
    this.#base = ServerUrl.parse(context.baseUrl);
    this.#transport = context.transport;
  }

  getInstance(options: RequestLifetime = {}): Promise<Instance> {
    // Deliberately do not spread caller input: this public method cannot inherit
    // authorization, even from an untyped JS caller supplying extra properties.
    return this.request({
      method: "GET",
      expectedStatuses: [200],
      maxResponseBytes: MAX_METADATA_RESPONSE_BYTES,
      path: ["instance"],
      decode: decodeInstance,
      signal: options.signal,
      timeoutMs: options.timeoutMs,
    });
  }

  request<T>(options: JsonRequest<T>): Promise<T>;
  request(options: EmptyRequest): Promise<void>;
  async request<T>(options: JsonRequest<T> | EmptyRequest): Promise<T | void> {
    const signal = options.signal;
    const expectsEmpty = "response" in options;
    const decode = "decode" in options ? options.decode : undefined;
    const declaredStatuses = options.expectedStatuses;
    if (
      !Array.isArray(declaredStatuses) ||
      declaredStatuses.length === 0 ||
      Array.from(declaredStatuses).some((status) =>
        expectsEmpty ? status !== 204 : status !== 200 && status !== 201,
      )
    ) {
      throw new TypeError("Declare nonempty expected JSON (200/201) or empty (204) statuses.");
    }
    const expectedStatuses: readonly number[] = [...declaredStatuses];
    const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes <= 0) {
      throw new TypeError("Response byte budget must be a positive safe integer.");
    }
    const timeout = options.timeoutMs ?? 15000;
    if (!Number.isInteger(timeout) || timeout <= 0 || timeout > 2147483647) {
      throw new TypeError("Request timeout must be a positive 32-bit millisecond duration.");
    }
    const url = apiUrl(this.#base, options.path, options.query);
    const headers = new Headers({ Accept: "application/json" });
    if (options.accessToken !== undefined) {
      if (!/^[A-Za-z0-9\-._~+/]+=*$/.test(options.accessToken)) {
        throw new TypeError("Invalid bearer token syntax.");
      }
      headers.set("Authorization", `Bearer ${options.accessToken}`);
    }
    let body: string | undefined;
    if (options.body !== undefined) {
      if (options.method === "GET") throw new TypeError("GET requests cannot contain a body.");
      try {
        body = JSON.stringify(options.body);
      } catch {
        throw new TypeError("Request body is not JSON serializable.");
      }
      if (body === undefined) throw new TypeError("Request body is not JSON serializable.");
      headers.set("Content-Type", "application/json");
    }

    const controller = new AbortController();
    let rejectAbort: (error: ApiError) => void = () => {};
    const aborted = new Promise<never>((_, reject) => {
      rejectAbort = reject;
    });
    const abort = (category: "cancelled" | "timeout") => {
      if (controller.signal.aborted) return;
      // Reject before notifying I/O, so adapters cannot replace this distinction
      // with an opaque platform-specific cancellation error.
      rejectAbort(new ApiError(category));
      controller.abort();
    };
    const onAbort = () => abort("cancelled");
    signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => abort("timeout"), timeout);
    if (signal?.aborted) onAbort();
    let metadata: FailureMetadata = {};

    try {
      return await Promise.race([
        aborted,
        (async () => {
          if (controller.signal.aborted) throw new ApiError("cancelled");
          const response = await this.#transport(url, {
            method: options.method,
            headers,
            signal: controller.signal,
            ...(body === undefined ? {} : { body }),
          });
          if (controller.signal.aborted) {
            void response.body?.cancel().catch(() => {});
            throw new ApiError("cancelled");
          }
          metadata = responseMetadata(response);
          if (
            response.type === "opaqueredirect" ||
            (response.status >= 300 && response.status < 400)
          ) {
            void response.body?.cancel().catch(() => {});
            throw new ApiError("redirect", metadata);
          }
          if (response.ok && !expectedStatuses.includes(response.status)) {
            void response.body?.cancel().catch(() => {});
            throw new ApiError("invalid-response", metadata);
          }
          if (response.status === 204) return undefined;
          const media = response.headers.get("Content-Type")?.split(";")[0]?.trim().toLowerCase();
          if (media !== "application/json" && media !== "application/problem+json") {
            void response.body?.cancel().catch(() => {});
            throw new ApiError("invalid-response", metadata);
          }
          // The deadline includes bounded body consumption, not only headers.
          const text = await readBoundedText(
            response,
            response.ok
              ? maxResponseBytes
              : Math.min(maxResponseBytes, MAX_METADATA_RESPONSE_BYTES),
            controller.signal,
            metadata,
          );
          if (controller.signal.aborted) throw new ApiError("cancelled");
          let value: unknown;
          try {
            value = JSON.parse(text);
          } catch {
            throw new ApiError("invalid-response", metadata);
          }
          if (!response.ok) {
            const problem = parseProblem(value, response.status);
            if (!problem) throw new ApiError("invalid-response", metadata);
            throw new ApiError("http", {
              ...metadata,
              code: problem.code,
              requestId: metadata.requestId ?? problem.request_id,
            });
          }
          if (media === "application/problem+json" || expectsEmpty || !decode) {
            throw new ApiError("invalid-response", metadata);
          }
          try {
            return decode(value);
          } catch {
            throw new ApiError("invalid-response", metadata);
          }
        })(),
      ]);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      // Do not retain a raw fetch/plugin error: it can contain URLs or secrets,
      // and browser errors do not distinguish CORS, mixed content, TLS or DNS.
      throw new ApiError("transport", metadata);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      // Release pending native streams as well as requests on every path.
      controller.abort();
    }
  }
}

function responseMetadata(response: Response): FailureMetadata {
  const requestId = response.headers.get("X-Request-Id");
  const retry = retryAfterMs(response.headers.get("Retry-After"));
  return {
    ...(response.status ? { status: response.status } : {}),
    ...(requestId && isRequestId(requestId) ? { requestId } : {}),
    ...(retry === undefined ? {} : { retryAfterMs: retry }),
  };
}
