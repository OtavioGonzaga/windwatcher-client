import type { SessionGrant, UserIdentity } from "../../src/features/authentication/validation";

// Clearly synthetic, not a signed JWT or a usable remote credential.
export const grant: SessionGrant = {
  access_token: "synthetic.header.signature",
  refresh_token: "A".repeat(43),
  token_type: "Bearer",
  session_id: "019a0000-0000-7000-8000-000000000002",
  access_token_expires_at: "2026-11-06T12:15:00Z",
  session_expires_at: "2026-12-06T12:00:00Z",
};
export const user: UserIdentity = {
  id: "019a0000-0000-7000-8000-000000000001",
  username: "alice",
  created_at: "2026-11-06T12:00:00Z",
  updated_at: "2026-11-06T12:00:00Z",
  disabled_at: null,
};
