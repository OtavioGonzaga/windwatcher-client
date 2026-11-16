import type { components } from "../../shared/api/schema.generated";
import { serverUuid } from "../authentication/validation";
import { decodeConversation } from "./validation";

export type UserSummary = components["schemas"]["UserSummaryResponse"];
export type CreateDirect = components["schemas"]["CreateDirectRequest"];

export function validUsername(value: string): boolean {
  return /^[A-Za-z0-9_]{3,32}$/.test(value);
}

/** Exact discovery is not a general user directory or a paginated collection. */
export function decodeExactUser(value: unknown, submitted: string): UserSummary | null {
  if (
    typeof value !== "object" ||
    value === null ||
    !("items" in value) ||
    !Array.isArray(value.items) ||
    value.items.length > 1 ||
    !("has_more" in value) ||
    value.has_more !== false ||
    ("next_cursor" in value && value.next_cursor != null)
  )
    throw new Error("Invalid exact-user response.");
  if (value.items.length === 0) return null;
  const user: unknown = value.items[0];
  if (
    typeof user !== "object" ||
    user === null ||
    !("id" in user) ||
    !("username" in user) ||
    typeof user.username !== "string" ||
    !/^[a-z0-9_]{3,32}$/.test(user.username) ||
    !validUsername(submitted) ||
    user.username !== submitted.toLowerCase()
  )
    throw new Error("Invalid exact-user response.");
  return { id: serverUuid(user.id), username: user.username };
}

export function decodeDirect(value: unknown) {
  const conversation = decodeConversation(value);
  if (conversation.kind !== "direct" || conversation.membership.role !== "direct")
    throw new Error("Invalid Direct response.");
  return conversation;
}
