import type { components } from "./schema.generated";

export type Instance = components["schemas"]["InstanceResponse"];
type Problem = components["schemas"]["ProblemDetails"];

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function listOf<T extends string>(value: unknown, literal: T): value is T[] {
  return Array.isArray(value) && value.every((item) => item === literal);
}

/** Pinned v1 wire shape, not onboarding policy or proof of server identity. */
export function decodeInstance(value: unknown): Instance {
  if (
    !record(value) ||
    value.service !== "windwatcher" ||
    !listOf(value.api_versions, "v1") ||
    !listOf(value.auth_methods, "password") ||
    (value.registration !== "open" && value.registration !== "closed")
  )
    throw new TypeError("Invalid instance metadata.");
  return {
    service: value.service,
    api_versions: [...value.api_versions],
    auth_methods: [...value.auth_methods],
    registration: value.registration,
  };
}

export function parseProblem(value: unknown, status: number): Problem | undefined {
  if (
    !record(value) ||
    value.status !== status ||
    !Number.isInteger(status) ||
    typeof value.type !== "string" ||
    !value.type.startsWith("urn:windwatcher:problem:") ||
    typeof value.title !== "string" ||
    typeof value.detail !== "string" ||
    typeof value.code !== "string" ||
    value.code.length > 128 ||
    !/^[a-z_]+(?:\.[a-z_]+)+$/.test(value.code) ||
    typeof value.request_id !== "string" ||
    !isRequestId(value.request_id)
  )
    return undefined;
  return {
    type: value.type,
    title: value.title,
    status,
    detail: value.detail,
    code: value.code,
    request_id: value.request_id,
  };
}

export function isRequestId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
