import { ApiError } from "../../shared/api/error";
import { GroupAttemptExpired } from "./group-operation";

export type GroupFailure =
  | "ambiguous"
  | "expired"
  | "conflict"
  | "resultUnavailable"
  | "invalidTitle"
  | "tooMany"
  | "participant"
  | "rate"
  | "session";
export function groupFailure(error: unknown): {
  kind: GroupFailure;
  until?: number;
  terminal: boolean;
} {
  if (error instanceof GroupAttemptExpired) return { kind: "expired", terminal: true };
  if (error instanceof ApiError) {
    const { status, code, retryAfterMs } = error.metadata;
    if (status === 429)
      return { kind: "rate", until: Date.now() + (retryAfterMs ?? 1000), terminal: false };
    if (status === 401 && code === "auth.invalid_access_token")
      return { kind: "session", terminal: true };
    if (status === 409 && code === "idempotency.key_reused")
      return { kind: "conflict", terminal: true };
    if (status === 409 && code === "idempotency.result_unavailable")
      return { kind: "resultUnavailable", terminal: true };
    if (status === 422) {
      if (code === "conversation.invalid_title") return { kind: "invalidTitle", terminal: true };
      if (code === "conversation.too_many_participants") return { kind: "tooMany", terminal: true };
      if (code === "conversation.participant_unavailable")
        return { kind: "participant", terminal: true };
    }
  }
  // Unknown failure after invoking the mutation cannot prove remote rollback.
  return { kind: "ambiguous", terminal: false };
}
