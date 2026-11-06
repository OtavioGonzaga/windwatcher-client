import { ServerUrl } from "../../shared/api/url";
import { StorageError } from "../../shared/storage/errors";
import { LOCAL_ID } from "../../shared/storage/secret-store";

export interface ServerProfile {
  id: string;
  canonicalUrl: string;
  label: string;
  discovery: {
    kind: "supported" | "legacy";
    inspectedAt: string;
    apiVersions?: string[];
    authMethods?: string[];
    registration?: "open" | "closed";
    legacyAcknowledgedAt?: string;
  };
  createdAt: string;
  updatedAt: string;
}
export interface AccountRecord {
  id: string;
  serverProfileId: string;
  serverUserId: string;
  username: string;
  createdAt: string;
  updatedAt: string;
}
export interface ClientStateV1 {
  schemaVersion: 1;
  revision: number;
  serverProfiles: ServerProfile[];
  accounts: AccountRecord[];
  selectedAccountId: string | null;
}
export const emptyState = (): ClientStateV1 => ({
  schemaVersion: 1,
  revision: 0,
  serverProfiles: [],
  accounts: [],
  selectedAccountId: null,
});
const SERVER_USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function ensure(value: unknown): asserts value {
  if (!value) throw new StorageError("corrupt");
}
function object(value: unknown, keys?: string[]): asserts value is Record<string, unknown> {
  ensure(typeof value === "object" && value !== null && !Array.isArray(value));
  if (keys) ensure(Object.keys(value).every((key) => keys.includes(key)));
}
export function displayText(value: unknown, max = 80): asserts value is string {
  ensure(
    typeof value === "string" &&
      value.trim() === value &&
      Array.from(value).length >= 1 &&
      Array.from(value).length <= max &&
      !/[\p{Cc}\p{Cf}\p{Cs}]/u.test(value),
  );
}
function timestamp(value: unknown): asserts value is string {
  ensure(
    typeof value === "string" &&
      /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString() === value,
  );
}
function localId(value: unknown): asserts value is string {
  ensure(typeof value === "string" && LOCAL_ID.test(value));
}
function capabilities(value: unknown): asserts value is string[] {
  ensure(Array.isArray(value) && value.length <= 32);
  for (const item of value) displayText(item, 64);
  ensure(new Set(value).size === value.length);
}
/** There is no older persisted schema. V1 reads validate; future versions fail closed. */
export function decodeState(document: string | null): ClientStateV1 {
  if (document === null) return emptyState();
  ensure(document.length <= 1_048_576);
  ensure(new TextEncoder().encode(document).byteLength <= 1_048_576);
  let value: unknown;
  try {
    value = JSON.parse(document);
  } catch {
    throw new StorageError("corrupt");
  }
  object(value);
  if (typeof value.schemaVersion === "number" && value.schemaVersion > 1)
    throw new StorageError("version-unsupported");
  object(value, ["schemaVersion", "revision", "serverProfiles", "accounts", "selectedAccountId"]);
  ensure(
    value.schemaVersion === 1 &&
      typeof value.revision === "number" &&
      Number.isSafeInteger(value.revision) &&
      value.revision >= 0,
  );
  ensure(Array.isArray(value.serverProfiles) && value.serverProfiles.length <= 100);
  ensure(Array.isArray(value.accounts) && value.accounts.length <= 500);
  const ids = new Set<string>();
  const urls = new Set<string>();
  const serverProfiles: ServerProfile[] = [];
  for (const profile of value.serverProfiles) {
    object(profile, ["id", "canonicalUrl", "label", "discovery", "createdAt", "updatedAt"]);
    localId(profile.id);
    const id = profile.id;
    ensure(!ids.has(id));
    ids.add(id);
    ensure(typeof profile.canonicalUrl === "string" && profile.canonicalUrl.length <= 2048);
    try {
      ensure(ServerUrl.parse(profile.canonicalUrl).toString() === profile.canonicalUrl);
    } catch {
      throw new StorageError("corrupt");
    }
    ensure(!urls.has(profile.canonicalUrl));
    urls.add(profile.canonicalUrl);
    displayText(profile.label);
    timestamp(profile.createdAt);
    timestamp(profile.updatedAt);
    const d = profile.discovery;
    object(d, [
      "kind",
      "inspectedAt",
      "apiVersions",
      "authMethods",
      "registration",
      "legacyAcknowledgedAt",
    ]);
    timestamp(d.inspectedAt);
    let discovery: ServerProfile["discovery"];
    if (d.kind === "supported") {
      capabilities(d.apiVersions);
      capabilities(d.authMethods);
      ensure(d.apiVersions.includes("v1") && d.authMethods.includes("password"));
      ensure(d.registration === "open" || d.registration === "closed");
      ensure(d.legacyAcknowledgedAt === undefined);
      discovery = {
        kind: "supported",
        inspectedAt: d.inspectedAt,
        apiVersions: d.apiVersions,
        authMethods: d.authMethods,
        registration: d.registration,
      };
    } else {
      ensure(d.kind === "legacy");
      timestamp(d.legacyAcknowledgedAt);
      ensure(
        d.apiVersions === undefined && d.authMethods === undefined && d.registration === undefined,
      );
      discovery = {
        kind: "legacy",
        inspectedAt: d.inspectedAt,
        legacyAcknowledgedAt: d.legacyAcknowledgedAt,
      };
    }
    serverProfiles.push({
      id,
      canonicalUrl: profile.canonicalUrl,
      label: profile.label,
      discovery,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    });
  }
  const accountIds = new Set<string>();
  const identities = new Set<string>();
  const accounts: AccountRecord[] = [];
  for (const account of value.accounts) {
    object(account, [
      "id",
      "serverProfileId",
      "serverUserId",
      "username",
      "createdAt",
      "updatedAt",
    ]);
    localId(account.id);
    const id = account.id;
    ensure(!ids.has(id) && !accountIds.has(id));
    accountIds.add(id);
    ensure(typeof account.serverProfileId === "string" && ids.has(account.serverProfileId));
    ensure(typeof account.serverUserId === "string" && SERVER_USER_ID.test(account.serverUserId));
    const identity = `${account.serverProfileId}:${account.serverUserId}`;
    ensure(!identities.has(identity));
    identities.add(identity);
    displayText(account.username, 128);
    timestamp(account.createdAt);
    timestamp(account.updatedAt);
    accounts.push({
      id,
      serverProfileId: account.serverProfileId,
      serverUserId: account.serverUserId,
      username: account.username,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    });
  }
  ensure(
    value.selectedAccountId === null ||
      (typeof value.selectedAccountId === "string" && accountIds.has(value.selectedAccountId)),
  );
  return {
    schemaVersion: 1,
    revision: value.revision,
    serverProfiles,
    accounts,
    selectedAccountId: value.selectedAccountId,
  };
}
