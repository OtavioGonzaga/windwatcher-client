import { ApiClient } from "../../shared/api/client";
import type { RequestLifetime } from "../../shared/api/client";
import { serverUuid } from "../authentication/validation";
import { decodeConversation, decodeConversationPage } from "./validation";
import { decodeDirect, decodeExactUser } from "./direct-validation";
import type { CreateDirect } from "./direct-validation";
import { decodeGroup, decodeMemberPage, memberCursor } from "./group-validation";
import type { CreateGroup } from "./group-validation";

/** Internal server-bound operations. Credentials are supplied only by the session owner. */
export class ConversationsApi {
  constructor(private readonly client: ApiClient) {}

  createGroup(
    token: string,
    body: Omit<CreateGroup, "participant_ids"> & { participant_ids: readonly string[] },
    key: string,
    lifetime: RequestLifetime,
  ) {
    return this.client.request({
      method: "POST",
      path: ["conversations"],
      body: { kind: "group", title: body.title, participant_ids: [...body.participant_ids] },
      idempotencyKey: key,
      expectedStatuses: [200, 201],
      accessToken: token,
      decode: decodeGroup,
      maxResponseBytes: 4 * 1024 * 1024,
      signal: lifetime.signal,
      timeoutMs: 15000,
    });
  }

  listMembers(token: string, id: string, cursor: string | undefined, lifetime: RequestLifetime) {
    return this.client.request({
      method: "GET",
      path: ["conversations", serverUuid(id), "members"],
      query: { limit: "50", ...(cursor === undefined ? {} : { cursor: memberCursor(cursor) }) },
      expectedStatuses: [200],
      accessToken: token,
      decode: decodeMemberPage,
      maxResponseBytes: 64 * 1024,
      signal: lifetime.signal,
      timeoutMs: 15000,
    });
  }

  findExactUsername(token: string, username: string, lifetime: RequestLifetime) {
    return this.client.request({
      method: "GET",
      path: ["users"],
      query: { username },
      expectedStatuses: [200],
      accessToken: token,
      decode: (value) => decodeExactUser(value, username),
      maxResponseBytes: 4096,
      signal: lifetime.signal,
      timeoutMs: 15000,
    });
  }

  openDirect(token: string, participantId: string, key: string, lifetime: RequestLifetime) {
    const body: CreateDirect = { kind: "direct", participant_id: serverUuid(participantId) };
    return this.client.request({
      method: "POST",
      path: ["conversations"],
      body,
      idempotencyKey: key,
      expectedStatuses: [200, 201],
      accessToken: token,
      decode: decodeDirect,
      maxResponseBytes: 4 * 1024 * 1024,
      signal: lifetime.signal,
      timeoutMs: 15000,
    });
  }

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
