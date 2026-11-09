import { ApiError } from "../../shared/api/error";
import { StorageError } from "../../shared/storage/errors";
import type { SecretStore } from "../../shared/storage/secret-store";
import { randomLocalId } from "../../shared/storage/secret-store";
import type { ClientStateStore } from "../../shared/storage/state-store";
import type { OperationLease, OperationLocks } from "../../shared/storage/operation-lock";
import type { AccountRecord, AuthIntent, ClientStateV2 } from "../server-profiles/schema";
import { decodeSessionEnvelope, encodeSessionEnvelope } from "./envelope";
import type { SessionEnvelope } from "./envelope";
import { decodeSessionGrant, decodeUserIdentity } from "./validation";
import type { SessionGrant, UserIdentity } from "./validation";

export async function checkpoint(lease: OperationLease, signal?: AbortSignal) {
  await lease.check();
  if (signal?.aborted) throw new ApiError("cancelled");
}
function freshId(state: ClientStateV2, extra: string[] = []) {
  const ids = new Set([
    ...extra,
    ...state.serverProfiles.map((p) => p.id),
    ...state.accounts.map((a) => a.id),
    ...state.authOperations.flatMap((op) => [op.accountId, op.operationId]),
  ]);
  for (let i = 0; i < 10; i++) {
    const id = randomLocalId();
    if (!ids.has(id)) return id;
  }
  throw new StorageError("conflict");
}
function sameIntent(a: AuthIntent, b: AuthIntent) {
  return a.operationId === b.operationId && a.accountId === b.accountId;
}
function matches(envelope: SessionEnvelope, intent: AuthIntent) {
  return (
    envelope.accountId === intent.accountId &&
    envelope.profileId === intent.profileId &&
    envelope.userId === intent.userId &&
    envelope.generation === intent.targetGeneration &&
    envelope.operationId === intent.operationId &&
    envelope.grant.session_id === intent.sessionId
  );
}
export function matchesAccount(envelope: SessionEnvelope, account: AccountRecord) {
  return (
    account.session?.generation === envelope.generation &&
    account.session.operationId === envelope.operationId &&
    account.session.sessionId === envelope.grant.session_id
  );
}

/** Owns exact-ID, secret-first commits and reconciliation; never exposes credentials to React. */
export class SessionPersistence {
  constructor(
    readonly state: ClientStateStore,
    private readonly secrets: SecretStore,
    readonly locks: OperationLocks,
  ) {}

  async read(account: AccountRecord, lease: OperationLease): Promise<SessionEnvelope | null> {
    await lease.check();
    const bytes = await this.secrets.get(account.id, lease);
    await lease.check();
    if (!bytes) return null;
    try {
      return decodeSessionEnvelope(bytes, {
        accountId: account.id,
        profileId: account.serverProfileId,
        userId: account.serverUserId,
      });
    } finally {
      bytes.fill(0);
    }
  }
  async saveLogin(
    profileId: string,
    userInput: UserIdentity,
    grantInput: SessionGrant,
    signal?: AbortSignal,
  ): Promise<AccountRecord> {
    const user = decodeUserIdentity(userInput);
    const grant = decodeSessionGrant(grantInput);
    if (user.disabled_at) throw new ApiError("http", { status: 403, code: "auth.user_disabled" });
    return this.locks.run(
      `identity-${profileId}-${user.id}`,
      async (identityLease) => {
        await checkpoint(identityLease, signal);
        const initial = await this.state.load();
        const profile = initial.serverProfiles.find((p) => p.id === profileId);
        if (!profile) throw new StorageError("conflict");
        const existing = initial.accounts.find(
          (a) => a.serverProfileId === profileId && a.serverUserId === user.id,
        );
        const pending = initial.authOperations.find(
          (op) => op.profileId === profileId && op.userId === user.id,
        );
        const id = existing?.id ?? pending?.accountId ?? freshId(initial);
        return this.locks.run(
          `account-${id}`,
          async (lease) => {
            await checkpoint(lease, signal);
            await this.reconcileOne(id, lease);
            const state = await this.state.load();
            const current = state.accounts.find((a) => a.id === id);
            const old = state.authOperations.find((op) => op.accountId === id);
            let storedGeneration = 0;
            if (current) {
              try {
                storedGeneration = (await this.read(current, lease))?.generation ?? 0;
              } catch (error) {
                if (!(error instanceof StorageError) || error.category !== "corrupt") throw error;
              }
            }
            await checkpoint(lease, signal);
            const generation =
              Math.max(
                current?.session?.generation ?? 0,
                old?.targetGeneration ?? 0,
                storedGeneration,
              ) + 1;
            if (!Number.isSafeInteger(generation)) throw new StorageError("conflict");
            const intent: AuthIntent = {
              accountId: id,
              profileId,
              userId: user.id,
              sessionId: grant.session_id,
              operationId: freshId(state, [id]),
              kind: current ? "replace" : "create",
              phase: "prepared",
              expectedGeneration: current?.session?.generation ?? 0,
              targetGeneration: generation,
              startedAt: new Date().toISOString(),
            };
            await this.state.update((draft) => {
              if (
                signal?.aborted ||
                draft.serverProfiles.find((p) => p.id === profileId)?.canonicalUrl !==
                  profile.canonicalUrl
              )
                throw new StorageError("conflict");
              const pair = draft.accounts.find(
                (a) => a.serverProfileId === profileId && a.serverUserId === user.id,
              );
              if (pair && pair.id !== id) throw new StorageError("conflict");
              if ((pair?.session?.generation ?? 0) !== intent.expectedGeneration)
                throw new StorageError("conflict");
              draft.authOperations = draft.authOperations.filter((op) => op.accountId !== id);
              draft.authOperations.push(intent);
            });
            const envelope: SessionEnvelope = {
              accountId: id,
              profileId,
              userId: user.id,
              operationId: intent.operationId,
              generation,
              grant,
            };
            try {
              await this.persist(intent, envelope, lease, user.username, signal);
              const result = (await this.state.load()).accounts.find((a) => a.id === id);
              await checkpoint(lease, signal);
              if (!result) throw new StorageError("conflict");
              return result;
            } catch (error) {
              // Only a proven new orphan may be deleted. A committed or existing row is never compensated away.
              try {
                const latest = await this.state.load();
                const row = latest.accounts.find((a) => a.id === id);
                const completed =
                  row?.session?.operationId === intent.operationId &&
                  row.session.generation === intent.targetGeneration;
                if (signal?.aborted && completed) {
                  await this.state.update((draft) => {
                    if (
                      draft.selectedAccountId === id &&
                      draft.accounts.find((a) => a.id === id)?.session?.operationId ===
                        intent.operationId
                    )
                      draft.selectedAccountId =
                        initial.selectedAccountId &&
                        draft.accounts.some((a) => a.id === initial.selectedAccountId)
                          ? initial.selectedAccountId
                          : null;
                    // The saved value is retained; cancelled completion never publishes a ready context.
                  });
                }
                if (
                  !latest.accounts.some((a) => a.id === id) &&
                  intent.kind === "create" &&
                  latest.authOperations.some((op) => sameIntent(op, intent))
                ) {
                  await this.secrets.remove(id, lease);
                  await this.clear(intent);
                } else if (!completed) {
                  if (signal?.aborted) await this.requireRecovery(intent);
                  else await this.reconcileOne(id, lease);
                }
              } catch {
                /* Keep the durable intent if compensation/lease/storage fails. */
              }
              throw error;
            }
          },
          true,
        );
      },
      true,
    );
  }
  async prepareRefresh(
    account: AccountRecord,
    envelope: SessionEnvelope,
    lease: OperationLease,
  ): Promise<AuthIntent> {
    await lease.check();
    const state = await this.state.load();
    const intent: AuthIntent = {
      accountId: account.id,
      profileId: account.serverProfileId,
      userId: account.serverUserId,
      sessionId: envelope.grant.session_id,
      operationId: freshId(state),
      kind: "refresh",
      phase: "prepared",
      expectedGeneration: envelope.generation,
      targetGeneration: envelope.generation + 1,
      startedAt: new Date().toISOString(),
    };
    await this.state.update((draft) => {
      const row = draft.accounts.find((a) => a.id === account.id);
      if (
        !row ||
        !matchesAccount(envelope, row) ||
        draft.authOperations.some((op) => op.accountId === account.id)
      )
        throw new StorageError("conflict");
      draft.authOperations.push(intent);
    });
    return intent;
  }
  async markSent(intent: AuthIntent, lease: OperationLease) {
    await lease.check();
    await this.state.update((draft) => {
      const op = draft.authOperations.find((item) => sameIntent(item, intent));
      if (!op || op.kind !== "refresh" || op.phase !== "prepared")
        throw new StorageError("conflict");
      op.phase = "sent";
    });
  }
  async requireRecovery(intent: AuthIntent) {
    await this.state.load();
    await this.state.update((draft) => {
      const op = draft.authOperations.find((item) => sameIntent(item, intent));
      if (op) op.phase = "recovery-required";
    });
  }
  async persist(
    intent: AuthIntent,
    envelope: SessionEnvelope,
    lease: OperationLease,
    username?: string,
    signal?: AbortSignal,
  ) {
    await checkpoint(lease, signal);
    if (!matches(envelope, intent)) throw new StorageError("conflict");
    const encoded = encodeSessionEnvelope(envelope);
    try {
      try {
        await this.secrets.put(intent.accountId, encoded, lease);
      } catch (error) {
        // A failed put may have committed. Only exact readback can establish the new value.
        const actual = await this.secrets.get(intent.accountId, lease);
        const same =
          actual?.length === encoded.length && actual.every((byte, i) => byte === encoded[i]);
        actual?.fill(0);
        if (!same) throw error;
      }
      await checkpoint(lease, signal);
      const verified = await this.secrets.get(intent.accountId, lease);
      const same =
        verified?.length === encoded.length && verified.every((byte, i) => byte === encoded[i]);
      verified?.fill(0);
      if (!same) throw new StorageError("write-failed");
      await checkpoint(lease, signal);
      await this.commit(intent, username, intent.kind !== "refresh", signal);
      await this.clear(intent);
    } finally {
      encoded.fill(0);
    }
  }
  private async commit(
    intent: AuthIntent,
    username?: string,
    select = false,
    signal?: AbortSignal,
  ) {
    await this.state.load();
    await this.state.update((draft) => {
      if (signal?.aborted) throw new StorageError("conflict");
      const op = draft.authOperations.find((item) => sameIntent(item, intent));
      if (!op || op.phase === "recovery-required") throw new StorageError("conflict");
      let row = draft.accounts.find((a) => a.id === intent.accountId);
      if (!row) {
        if (
          intent.kind !== "create" ||
          !username ||
          draft.accounts.some(
            (a) => a.serverProfileId === intent.profileId && a.serverUserId === intent.userId,
          )
        )
          throw new StorageError("conflict");
        row = {
          id: intent.accountId,
          serverProfileId: intent.profileId,
          serverUserId: intent.userId,
          username,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        draft.accounts.push(row);
      }
      if (
        row.serverProfileId !== intent.profileId ||
        row.serverUserId !== intent.userId ||
        ![intent.expectedGeneration, intent.targetGeneration].includes(row.session?.generation ?? 0)
      )
        throw new StorageError("conflict");
      row.session = {
        generation: intent.targetGeneration,
        sessionId: intent.sessionId,
        operationId: intent.operationId,
      };
      if (username) row.username = username;
      row.updatedAt = new Date().toISOString();
      if (select) draft.selectedAccountId = row.id;
    });
  }
  private async clear(intent: AuthIntent) {
    await this.state.load();
    await this.state.update((draft) => {
      draft.authOperations = draft.authOperations.filter((op) => !sameIntent(op, intent));
    });
  }
  async reconcileOne(id: string, lease: OperationLease) {
    await lease.check();
    const state = await this.state.load();
    const intent = state.authOperations.find((op) => op.accountId === id);
    if (!intent) return;
    const account = state.accounts.find((a) => a.id === id);
    if (!account) {
      if (intent.kind !== "create") throw new StorageError("corrupt");
      await this.secrets.remove(id, lease);
      await this.clear(intent);
      return;
    }
    if (intent.phase === "recovery-required") return;
    let envelope: SessionEnvelope | null;
    try {
      envelope = await this.read(account, lease);
    } catch (error) {
      if (!(error instanceof StorageError) || error.category !== "corrupt") throw error;
      await this.requireRecovery(intent);
      return;
    }
    const age = Date.now() - Date.parse(intent.startedAt);
    if (envelope && matches(envelope, intent) && age >= -300_000 && age <= 86_400_000) {
      await this.commit(intent);
      await this.clear(intent);
      return;
    }
    if (
      intent.kind === "refresh" &&
      intent.phase === "prepared" &&
      envelope &&
      matchesAccount(envelope, account)
    ) {
      // The durable sent marker always precedes the POST; this token was not consumed.
      await this.clear(intent);
      return;
    }
    await this.requireRecovery(intent);
  }
  async reconcileAll() {
    const state = await this.state.load();
    for (const op of state.authOperations) {
      // oxlint-disable-next-line no-await-in-loop -- Never run vault/crash reconciliation batches concurrently.
      await this.locks.run(`account-${op.accountId}`, (lease) =>
        this.reconcileOne(op.accountId, lease),
      );
    }
  }
}
