import type { Instance } from "../../src/shared/api/validation";

export const instance = {
  service: "windwatcher",
  api_versions: ["v1"],
  registration: "closed",
  auth_methods: ["password"],
} satisfies Instance;

export const requestId = "019a0000-0000-7000-8000-000000000001";

export function problem(status: number, code = "internal.error") {
  return {
    type: "urn:windwatcher:problem:fixture",
    title: "Fixture problem",
    status,
    detail: "Untrusted fixture prose.",
    code,
    request_id: requestId,
  };
}
