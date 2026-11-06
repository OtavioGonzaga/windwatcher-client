import { ApiClient } from "../../shared/api/client";
import type { RequestLifetime } from "../../shared/api/client";
import type { components } from "../../shared/api/schema.generated";
import {
  accessToken,
  decodeSessionGrant,
  decodeUserIdentity,
  refreshToken,
  MAX_GRANT_RESPONSE_BYTES,
  MAX_USER_RESPONSE_BYTES,
} from "./validation";

type Credentials = components["schemas"]["CreateSessionRequest"];

/** One immutable server binding; no mutable/global bearer defaults or automatic retries. */
export class AuthApi {
  constructor(private readonly client: ApiClient) {}

  register(username: string, password: string, lifetime: RequestLifetime = {}) {
    const body = { username, password } satisfies components["schemas"]["RegisterUserRequest"];
    return this.client.request({
      method: "POST",
      path: ["users"],
      expectedStatuses: [201],
      body,
      maxResponseBytes: MAX_USER_RESPONSE_BYTES,
      decode: decodeUserIdentity,
      signal: lifetime.signal,
      timeoutMs: lifetime.timeoutMs,
    });
  }
  login(username: string, password: string, lifetime: RequestLifetime = {}) {
    const body = { username, password } satisfies Credentials;
    return this.client.request({
      method: "POST",
      path: ["sessions"],
      expectedStatuses: [201],
      body,
      maxResponseBytes: MAX_GRANT_RESPONSE_BYTES,
      decode: decodeSessionGrant,
      signal: lifetime.signal,
      timeoutMs: lifetime.timeoutMs,
    });
  }
  refresh(token: string, lifetime: RequestLifetime = {}) {
    const body = {
      refresh_token: refreshToken(token),
    } satisfies components["schemas"]["RefreshSessionRequest"];
    return this.client.request({
      method: "POST",
      path: ["sessions", "refresh"],
      expectedStatuses: [200],
      body,
      maxResponseBytes: MAX_GRANT_RESPONSE_BYTES,
      decode: decodeSessionGrant,
      signal: lifetime.signal,
      timeoutMs: lifetime.timeoutMs,
    });
  }
  currentUser(token: string, lifetime: RequestLifetime = {}) {
    return this.client.request({
      method: "GET",
      path: ["users", "me"],
      expectedStatuses: [200],
      accessToken: accessToken(token),
      maxResponseBytes: MAX_USER_RESPONSE_BYTES,
      decode: decodeUserIdentity,
      signal: lifetime.signal,
      timeoutMs: lifetime.timeoutMs,
    });
  }
  /** Best-effort cleanup of a freshly created, never-persisted login; not a logout UI. */
  revokeUncommitted(token: string, lifetime: RequestLifetime = {}) {
    return this.client.request({ method: "DELETE", path: ["sessions", "current"], expectedStatuses: [204], response: "empty",
      accessToken: accessToken(token), signal: lifetime.signal, timeoutMs: lifetime.timeoutMs });
  }
}
