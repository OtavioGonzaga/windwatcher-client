import { ApiError } from "./error";
import type { FailureMetadata } from "./error";

// 100 default-policy messages + full shallow replies + worst-case JSON escaping
// require 150 MiB of content alone. This is client policy, not a protocol maximum.
export const DEFAULT_MAX_RESPONSE_BYTES = 160 * 1024 * 1024;
export const MAX_METADATA_RESPONSE_BYTES = 64 * 1024;

/** Count actual body bytes before decoding; never retain an oversized chunk. */
export async function readBoundedText(
  response: Response,
  maxBytes: number,
  signal: AbortSignal,
  metadata: FailureMetadata,
): Promise<string> {
  const length = response.headers.get("Content-Length");
  const encoding = response.headers.get("Content-Encoding")?.trim().toLowerCase();
  // A compressed Content-Length is not the decoded stream size. Never rely on
  // headers alone: missing, understated or encoded lengths still use the counter.
  if (
    (!encoding || encoding === "identity") &&
    length &&
    /^\d+$/.test(length) &&
    Number(length) > maxBytes
  ) {
    void response.body?.cancel().catch(() => {});
    throw new ApiError("response-too-large", metadata);
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const onAbort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", onAbort, { once: true });
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const text: string[] = [];
  let received = 0;
  let completed = false;
  try {
    while (true) {
      if (signal.aborted) throw new ApiError("cancelled", metadata);
      // One ordered stream must be consumed serially; parallel reads defeat its budget.
      // oxlint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read();
      if (signal.aborted) throw new ApiError("cancelled", metadata);
      if (done) {
        completed = true;
        break;
      }
      if (value.byteLength > maxBytes - received)
        throw new ApiError("response-too-large", metadata);
      received += value.byteLength;
      try {
        text.push(decoder.decode(value, { stream: true }));
      } catch {
        throw new ApiError("invalid-response", metadata);
      }
    }
    try {
      text.push(decoder.decode());
    } catch {
      throw new ApiError("invalid-response", metadata);
    }
    return text.join("");
  } finally {
    signal.removeEventListener("abort", onAbort);
    if (!completed) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
