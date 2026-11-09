import { ApiClient } from "../../shared/api/client";
import type { RequestLifetime } from "../../shared/api/client";
import { serverUuid } from "../authentication/validation";
import { decodeConversation, decodeConversationPage } from "./validation";

/** Internal server-bound operations. Credentials are supplied only by the session owner. */
export class ConversationsApi {
  constructor(private readonly client: ApiClient) {}

  list(token: string, cursor: string | undefined, lifetime: RequestLifetime) {
    return this.client.request({
      method: "GET",
      path: ["conversations"],
      expectedStatuses: [200],
      query: { limit: "50", ...(cursor === undefined ? {} : { cursor }) },
      accessToken: token,
      decode: decodeConversationPage,
      // Half of the shared 100-item 160 MiB budget, plus metadata headroom.
      maxResponseBytes: 84 * 1024 * 1024,
      signal: lifetime.signal,
      timeoutMs: 15000,
    });
  }

  get(token: string, id: string, lifetime: RequestLifetime) {
    const conversationId = serverUuid(id);
    return this.client.request({
      method: "GET",
      path: ["conversations", conversationId],
      expectedStatuses: [200],
      accessToken: token,
      decode: (value) => {
        const conversation = decodeConversation(value);
        if (conversation.id !== conversationId) throw new Error("Invalid response.");
        return conversation;
      },
      maxResponseBytes: 4 * 1024 * 1024,
      signal: lifetime.signal,
      timeoutMs: 15000,
    });
  }
}
