import type { DiscoveryResult } from "../server-discovery/discover-server";
import type { ClientStateStore } from "../../shared/storage/state-store";
import type { SecretStore } from "../../shared/storage/secret-store";
import { randomLocalId } from "../../shared/storage/secret-store";
import { StorageError } from "../../shared/storage/errors";
import { displayText, ensure } from "./schema";
import type { ClientStateV1, ServerProfile } from "./schema";
import { ServerUrl } from "../../shared/api/url";

function newId(state: ClientStateV1) {
  for (let i = 0; i < 10; i++) {
    const id = randomLocalId();
    if (![...state.serverProfiles, ...state.accounts].some((record) => record.id === id)) return id;
  }
  throw new StorageError("write-failed");
}
export function defaultLabel(root: string) {
  const url = new URL(root);
  return Array.from(`${url.host}${url.pathname === "/" ? "" : url.pathname}`)
    .slice(0, 80)
    .join("");
}
export class ProfileRepository {
  constructor(
    private readonly state: ClientStateStore,
    private readonly secrets: SecretStore,
  ) {}
  load() {
    return this.state.load();
  }
  subscribe(listener: () => void) {
    return this.state.subscribe(listener);
  }
  saveInspection(
    result: DiscoveryResult,
    label: string,
    acknowledged: boolean,
    updateExisting = false,
    revision?: number,
  ) {
    // Copy only bounded, nonsecret fields; caller-owned result objects cannot mutate a queued write.
    ensure(
      result.kind === "supported" ||
        (result.kind === "legacy" && result.recognized && acknowledged),
    );
    if (result.kind === "supported") ensure(result.metadata.service === "windwatcher");
    const canonicalUrl = ServerUrl.parse(result.root).toString();
    const cleanLabel = label.trim() || defaultLabel(canonicalUrl);
    displayText(cleanLabel);
    const now = new Date().toISOString();
    const discovery: ServerProfile["discovery"] =
      result.kind === "supported"
        ? {
            kind: "supported",
            inspectedAt: now,
            apiVersions: [...result.metadata.api_versions],
            authMethods: [...result.metadata.auth_methods],
            registration: result.metadata.registration,
          }
        : { kind: "legacy", inspectedAt: now, legacyAcknowledgedAt: now };
    return this.state.update((draft) => {
      const existing = draft.serverProfiles.find((p) => p.canonicalUrl === canonicalUrl);
      if (existing && !updateExisting) throw new StorageError("duplicate");
      if (existing) {
        existing.label = cleanLabel;
        existing.discovery = discovery;
        existing.updatedAt = now;
      } else
        draft.serverProfiles.push({
          id: newId(draft),
          canonicalUrl,
          label: cleanLabel,
          discovery,
          createdAt: now,
          updatedAt: now,
        });
    }, revision);
  }
  renameProfile(id: string, label: string, revision?: number) {
    const cleanLabel = label.trim();
    displayText(cleanLabel);
    return this.state.update((draft) => {
      const profile = draft.serverProfiles.find((p) => p.id === id);
      ensure(profile);
      profile.label = cleanLabel;
      profile.updatedAt = new Date().toISOString();
    }, revision);
  }
  forgetProfile(id: string, revision?: number) {
    return this.state.update(async (draft) => {
      ensure(draft.serverProfiles.some((p) => p.id === id));
      // Keep ALL metadata on any cleanup failure, including partial deletion, for retry.
      for (const account of draft.accounts.filter((a) => a.serverProfileId === id))
        // oxlint-disable-next-line no-await-in-loop -- Stop on the first cleanup failure; retain metadata for retry.
        await this.secrets.remove(account.id);
      const removed = new Set(
        draft.accounts.filter((a) => a.serverProfileId === id).map((a) => a.id),
      );
      draft.accounts = draft.accounts.filter((a) => !removed.has(a.id));
      if (draft.selectedAccountId && removed.has(draft.selectedAccountId))
        draft.selectedAccountId = null;
      draft.serverProfiles = draft.serverProfiles.filter((p) => p.id !== id);
    }, revision);
  }
  /**
   * Metadata-only registry operation; not a session-persistence entry point.
   * PR 8 must prepare/reuse a local ID before secret write/verification and then
   * commit that exact ID through a coordinating application operation. See the
   * cross-store prerequisite in docs/storage-and-accounts.md before storing tokens.
   */
  registerAccount(serverProfileId: string, serverUserId: string, username: string) {
    return this.state.update((draft) => {
      ensure(draft.serverProfiles.some((p) => p.id === serverProfileId));
      if (
        draft.accounts.some(
          (a) => a.serverProfileId === serverProfileId && a.serverUserId === serverUserId,
        )
      )
        throw new StorageError("duplicate");
      const now = new Date().toISOString();
      draft.accounts.push({
        id: newId(draft),
        serverProfileId,
        serverUserId,
        username,
        createdAt: now,
        updatedAt: now,
      });
    });
  }
  updateAccount(id: string, username: string) {
    return this.state.update((draft) => {
      const account = draft.accounts.find((a) => a.id === id);
      ensure(account);
      account.username = username;
      account.updatedAt = new Date().toISOString();
    });
  }
  removeAccount(id: string) {
    return this.state.update(async (draft) => {
      ensure(draft.accounts.some((a) => a.id === id));
      await this.secrets.remove(id);
      draft.accounts = draft.accounts.filter((a) => a.id !== id);
      if (draft.selectedAccountId === id) draft.selectedAccountId = null;
    });
  }
  selectAccount(id: string | null) {
    return this.state.update((draft) => {
      ensure(id === null || draft.accounts.some((a) => a.id === id));
      draft.selectedAccountId = id;
    });
  }
}
