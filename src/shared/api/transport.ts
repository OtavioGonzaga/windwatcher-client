export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/** Adapters must omit ambient credentials, refuse redirects and honor signal. */
export type HttpTransport = (
  url: URL,
  request: {
    readonly method: HttpMethod;
    readonly headers: Headers;
    readonly body?: string;
    readonly signal: AbortSignal;
  },
) => Promise<Response>;
