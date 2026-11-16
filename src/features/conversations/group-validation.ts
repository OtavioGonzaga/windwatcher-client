import type { components } from "../../shared/api/schema.generated";
import { serverUuid } from "../authentication/validation";

export type CreateGroup = components["schemas"]["CreateGroupRequest"];
export type GroupScope = {
  readonly profileId: string;
  readonly accountId: string;
  readonly userId: string;
  readonly epoch: number;
};

export type TitleIssue = "blank" | "long" | "unicode";

export function groupTitleIssue(title: string): TitleIssue | undefined {
  if (/[\uD800-\uDFFF]/u.test(title)) return "unicode";
  if (new TextEncoder().encode(title).byteLength > 256) return "long";
  // Rust str::trim uses Unicode White_Space, not ECMAScript trim (FEFF/0085 differ).
  if (/^\p{White_Space}*$/u.test(title)) return "blank";
  return undefined;
}

export function groupDraft(title: string, ids: readonly string[], actor: string): CreateGroup {
  if (groupTitleIssue(title)) throw new TypeError("Invalid Group title.");
  const participant_ids = [...new Set(ids.map(serverUuid))].filter((id) => id !== actor).sort();
  if (participant_ids.length > 256) throw new TypeError("Too many Group participants.");
  return { kind: "group", title, participant_ids };
}
