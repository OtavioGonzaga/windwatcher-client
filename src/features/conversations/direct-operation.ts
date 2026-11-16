import { ApiError } from "../../shared/api/error";
import type { UserSummary } from "./direct-validation";

const WINDOW_MS = 24 * 60 * 60 * 1000;

/** A form-owned operation, never serialized, logged, or shared across contexts. */
export class DirectOperation {
  readonly #key = crypto.randomUUID();
  readonly participantId: string;
  readonly #startedAt: number;
  #stopped = false;
  constructor(user: UserSummary, now = Date.now()) {
    this.participantId = user.id;
    this.#startedAt = now;
  }
  eligible(now = Date.now()): boolean {
    return !this.#stopped && now >= this.#startedAt && now - this.#startedAt < WINDOW_MS;
  }
  stop() {
    this.#stopped = true;
  }
  dispatch<T>(
    send: (participantId: string, key: string) => Promise<T>,
    now = Date.now(),
  ): Promise<T> {
    if (!this.eligible(now)) return Promise.reject(new Error("Direct operation expired."));
    return send(this.participantId, this.#key);
  }
}

export type DirectFailure =
  | "network"
  | "invalid"
  | "username"
  | "unavailable"
  | "conflict"
  | "resultUnavailable"
  | "ambiguous"
  | "rate"
  | "expired";

export function directFailure(
  error: unknown,
  mutation: boolean,
): { kind: DirectFailure; until?: number } {
  if (error instanceof ApiError) {
    const { status, code } = error.metadata;
    if (status === 429)
      return { kind: "rate", until: Date.now() + (error.metadata.retryAfterMs ?? 1000) };
    if (status === 422 && code === "user.invalid_username") return { kind: "username" };
    if (status === 422 && code === "conversation.participant_unavailable")
      return { kind: "unavailable" };
    if (status === 409 && code === "idempotency.key_reused") return { kind: "conflict" };
    if (status === 409 && code === "idempotency.result_unavailable")
      return { kind: "resultUnavailable" };
    if (
      mutation &&
      ([
        "transport",
        "timeout",
        "cancelled",
        "invalid-response",
        "response-too-large",
        "redirect",
      ].includes(error.category) ||
        (status !== undefined && status >= 500))
    )
      return { kind: "ambiguous" };
    if (error.category === "invalid-response" || error.category === "response-too-large")
      return { kind: "invalid" };
  }
  return { kind: "network" };
}
