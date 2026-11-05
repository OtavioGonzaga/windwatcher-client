import { describe, expect, it, vi } from "vitest";
import { DEFAULT_MAX_RESPONSE_BYTES, MAX_METADATA_RESPONSE_BYTES, readBoundedText } from "./body";

function streamed(chunks: Uint8Array[], headers: Record<string, string> = {}) {
  const cancel = vi.fn();
  let reads = 0;
  const response = new Response(
    new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          const chunk = chunks[reads++];
          if (chunk) controller.enqueue(chunk);
          else controller.close();
        },
        cancel,
      },
      { highWaterMark: 0 },
    ),
    { headers },
  );
  return { response, cancel, reads: () => reads };
}
const encode = (text: string) => new TextEncoder().encode(text);
const read = (response: Response, budget: number, signal = new AbortController().signal) =>
  readBoundedText(response, budget, signal, { status: response.status });

describe("bounded response reading", () => {
  it("decodes UTF-8 across chunks at the exact byte boundary", async () => {
    const source = JSON.stringify({ text: "é🙂" });
    const bytes = encode(source);
    const { response, cancel } = streamed(Array.from(bytes, (byte) => new Uint8Array([byte])));
    await expect(read(response, bytes.byteLength)).resolves.toBe(source);
    expect(cancel).not.toHaveBeenCalled();
    expect(response.body?.locked).toBe(false);
  });

  it.each([{}, { "Content-Length": "1" }, { "Content-Length": "not-a-number" }])(
    "counts actual bytes with absent or untrustworthy length %j",
    async (headers) => {
      const { response, cancel, reads } = streamed(
        [encode("abc"), encode("def"), encode("unread secret")],
        headers,
      );
      await expect(read(response, 5)).rejects.toMatchObject({
        category: "response-too-large",
        metadata: { status: 200 },
      });
      expect(cancel).toHaveBeenCalledOnce();
      expect(reads()).toBe(2);
      expect(response.body?.locked).toBe(false);
    },
  );

  it("rejects an oversized declared identity body before reading it", async () => {
    const { response, cancel, reads } = streamed([encode("unread")], { "Content-Length": "1000" });
    await expect(read(response, 5)).rejects.toMatchObject({ category: "response-too-large" });
    expect(cancel).toHaveBeenCalledOnce();
    expect(reads()).toBe(0);
  });

  it("does not confuse compressed wire length with the delivered stream", async () => {
    await expect(
      read(
        streamed([encode("abcd")], { "Content-Encoding": "gzip", "Content-Length": "1000" })
          .response,
        4,
      ),
    ).resolves.toBe("abcd");
    await expect(
      read(
        streamed([encode("decoded bytes")], { "Content-Encoding": "gzip", "Content-Length": "1" })
          .response,
        4,
      ),
    ).rejects.toMatchObject({ category: "response-too-large" });
  });

  it.each([{ bytes: [0xc3, 0x28] }, { bytes: [0xe2] }])(
    "rejects malformed or truncated UTF-8 %j",
    async ({ bytes }) => {
      const { response } = streamed([new Uint8Array(bytes)]);
      await expect(read(response, 100)).rejects.toMatchObject({ category: "invalid-response" });
      expect(response.body?.locked).toBe(false);
    },
  );

  it("cancels a pending read on caller abort, even if a mock ignores fetch cancellation", async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }, { highWaterMark: 0 }));
    const controller = new AbortController();
    const pending = read(response, 100, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ category: "cancelled" });
    expect(cancel).toHaveBeenCalledOnce();
    expect(response.body?.locked).toBe(false);
  });

  it("has finite defaults sized for a full default-policy message page and replies", () => {
    const worstContentBytes = 100 * 2 * 131072 * 6;
    expect(DEFAULT_MAX_RESPONSE_BYTES).toBeGreaterThan(worstContentBytes);
    expect(MAX_METADATA_RESPONSE_BYTES).toBe(65536);
    expect(Number.isSafeInteger(DEFAULT_MAX_RESPONSE_BYTES)).toBe(true);
  });
});
