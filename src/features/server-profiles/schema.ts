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
  session?: { generation: number; sessionId: string; operationId: string };
}
export interface ClientStateV1 {
  schemaVersion: 1;
  revision: number;
  serverProfiles: ServerProfile[];
  accounts: AccountRecord[];
  selectedAccountId: string | null;
}
export interface AuthIntent {
  accountId: string;
  profileId: string;
  userId: string;
  sessionId: string;
  operationId: string;
  kind: "create" | "replace" | "refresh";
  phase: "prepared" | "sent" | "recovery-required";
  expectedGeneration: number;
  targetGeneration: number;
  startedAt: string;
}
export interface ClientStateV2 extends Omit<ClientStateV1, "schemaVersion"> {
  schemaVersion: 2;
  authOperations: AuthIntent[];
}
export const emptyState = (): ClientStateV2 => ({
  schemaVersion: 2,
  revision: 0,
  serverProfiles: [],
  accounts: [],
  selectedAccountId: null,
  authOperations: [],
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
/** Validate V1 completely before deriving V2; no read-time writes or credential alias changes. */
export function decodeState(document: string | null): ClientStateV2 {
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
  if (typeof value.schemaVersion === "number" && value.schemaVersion > 2)
    throw new StorageError("version-unsupported");
  const v2 = value.schemaVersion === 2;
  object(value, [
    "schemaVersion",
    "revision",
    "serverProfiles",
    "accounts",
    "selectedAccountId",
    ...(v2 ? ["authOperations"] : []),
  ]);
  ensure(
    (value.schemaVersion === 1 || v2) &&
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
      ...(v2 ? ["session"] : []),
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
    let session: AccountRecord["session"];
    if (account.session !== undefined) {
      object(account.session, ["generation", "sessionId", "operationId"]);
      const s = account.session;
      ensure(
        typeof s.generation === "number" && Number.isSafeInteger(s.generation) && s.generation > 0,
      );
      ensure(typeof s.sessionId === "string" && SERVER_USER_ID.test(s.sessionId));
      localId(s.operationId);
      session = { generation: s.generation, sessionId: s.sessionId, operationId: s.operationId };
    }
    accounts.push({
      id,
      serverProfileId: account.serverProfileId,
      serverUserId: account.serverUserId,
      username: account.username,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
      ...(session ? { session } : {}),
    });
  }
  ensure(
    value.selectedAccountId === null ||
      (typeof value.selectedAccountId === "string" && accountIds.has(value.selectedAccountId)),
  );
  const authOperations: AuthIntent[] = [];
  if (v2) {
    ensure(Array.isArray(value.authOperations) && value.authOperations.length <= 500);
    const reserved = new Set<string>();
    const operations = new Set<string>();
    const pairs = new Set<string>();
    for (const intent of value.authOperations) {
      object(intent, [
        "accountId",
        "profileId",
        "userId",
        "sessionId",
        "operationId",
        "kind",
        "phase",
        "expectedGeneration",
        "targetGeneration",
        "startedAt",
      ]);
      localId(intent.accountId);
      localId(intent.profileId);
      localId(intent.operationId);
      ensure(ids.has(intent.profileId) && !ids.has(intent.accountId));
      ensure(typeof intent.userId === "string" && SERVER_USER_ID.test(intent.userId));
      ensure(typeof intent.sessionId === "string" && SERVER_USER_ID.test(intent.sessionId));
      ensure(intent.kind === "create" || intent.kind === "replace" || intent.kind === "refresh");
      ensure(
        intent.phase === "prepared" ||
          intent.phase === "sent" ||
          intent.phase === "recovery-required",
      );
      ensure(intent.phase !== "sent" || intent.kind === "refresh");
      ensure(
        typeof intent.expectedGeneration === "number" &&
          Number.isSafeInteger(intent.expectedGeneration) &&
          intent.expectedGeneration >= 0,
      );
      ensure(
        typeof intent.targetGeneration === "number" &&
          Number.isSafeInteger(intent.targetGeneration) &&
          intent.targetGeneration > intent.expectedGeneration,
      );
      timestamp(intent.startedAt);
      const pair = `${intent.profileId}:${intent.userId}`;
      ensure(
        !reserved.has(intent.accountId) && !operations.has(intent.operationId) && !pairs.has(pair),
      );
      reserved.add(intent.accountId);
      operations.add(intent.operationId);
      pairs.add(pair);
      const account = accounts.find((a) => a.id === intent.accountId);
      if (!account)
        ensure(
          intent.kind === "create" && intent.expectedGeneration === 0 && !identities.has(pair),
        );
      else {
        ensure(
          account.serverProfileId === intent.profileId && account.serverUserId === intent.userId,
        );
        const completed =
          account.session?.generation === intent.targetGeneration &&
          account.session.operationId === intent.operationId &&
          account.session.sessionId === intent.sessionId;
        ensure(
          completed ||
            (intent.kind !== "create" &&
              (account.session?.generation ?? 0) === intent.expectedGeneration),
        );
      }
      authOperations.push({
        accountId: intent.accountId,
        profileId: intent.profileId,
        userId: intent.userId,
        sessionId: intent.sessionId,
        operationId: intent.operationId,
        kind: intent.kind,
        phase: intent.phase,
        expectedGeneration: intent.expectedGeneration,
        targetGeneration: intent.targetGeneration,
        startedAt: intent.startedAt,
      });
    }
  }
  return {
    schemaVersion: 2,
    revision: value.revision,
    serverProfiles,
    accounts,
    selectedAccountId: value.selectedAccountId,
    authOperations,
  };
}
