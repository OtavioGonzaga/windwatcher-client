export type FailureCategory =
  | "http"
  | "invalid-response"
  | "timeout"
  | "cancelled"
  | "transport"
  | "redirect";

export interface FailureMetadata {
  readonly status?: number;
  readonly code?: string;
  readonly requestId?: string;
  readonly retryAfterMs?: number;
}

/** Never retains raw URLs, request bodies, server prose or transport causes. */
export class ApiError extends Error {
  readonly category: FailureCategory;
  readonly metadata: Readonly<FailureMetadata>;

  constructor(category: FailureCategory, metadata: FailureMetadata = {}) {
    super(`API request failed (${category}).`);
    this.name = "ApiError";
    this.category = category;
    this.metadata = Object.freeze({ ...metadata });
  }
}

/** RFC delay-seconds or HTTP-date, never a retry policy. */
export function retryAfterMs(value: string | null, now = Date.now()): number | undefined {
  if (value === null) return undefined;
  const text = value.trim();
  if (/^\d+$/.test(text)) {
    const milliseconds = Number(text) * 1000;
    return Number.isSafeInteger(milliseconds) ? milliseconds : undefined;
  }
  // Date.parse alone accepts non-HTTP strings such as "1" and "-1".
  if (
    !/^(?:[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT|[A-Z][a-z]+, \d{2}-[A-Z][a-z]{2}-\d{2} \d{2}:\d{2}:\d{2} GMT|[A-Z][a-z]{2} [A-Z][a-z]{2} [ \d]\d \d{2}:\d{2}:\d{2} \d{4})$/.test(
      text,
    )
  )
    return undefined;
  const instant = Date.parse(text);
  return Number.isFinite(instant) ? Math.max(0, instant - now) : undefined;
}
