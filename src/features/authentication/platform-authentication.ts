import { ApiClient } from "../../shared/api/client";
import { platformHttp } from "../../shared/platform/http";
import { sessionPersistence } from "../../shared/storage/platform-storage";
import { AuthApi } from "./api";
import { AuthenticationService } from "./service";
import { ConversationsApi } from "../conversations/api";

let current: Promise<AuthenticationService> | undefined;

/** Share one session-state owner and one refresh-flight registry per renderer. */
export function authenticationService(): Promise<AuthenticationService> {
  current ??= Promise.all([sessionPersistence(), platformHttp()])
    .then(
      ([persistence, transport]) =>
        new AuthenticationService(
          persistence,
          (profile) => new AuthApi(new ApiClient({ baseUrl: profile.canonicalUrl, transport })),
          Date.now,
          (profile) =>
            new ConversationsApi(new ApiClient({ baseUrl: profile.canonicalUrl, transport })),
        ),
    )
    .catch((error: unknown) => {
      // Initialization failures must not permanently poison retries.
      current = undefined;
      throw error;
    });
  return current;
}
