import { ApiError } from "../../shared/api/error";
import { StorageError } from "../../shared/storage/errors";
import type { StorageCategory } from "../../shared/storage/errors";
import type { OperationLease } from "../../shared/storage/operation-lock";
import type { AccountRecord, ServerProfile } from "../server-profiles/schema";
import { authFailure } from "./errors";
import type { AuthFailure } from "./errors";
import { checkpoint, matchesAccount, SessionPersistence } from "./persistence";
import type { SessionEnvelope } from "./envelope";
import type { SessionGrant, UserIdentity } from "./validation";
import type { AuthApi } from "./api";

export type LoginReason =
  | "expired"
  | "invalid"
  | "disabled"
  | "identity"
  | "recovery-required"
  | "missing";
export type SessionError =
  | AuthFailure
  | `storage-${StorageCategory}`
  | Exclude<LoginReason, "invalid">
  | "coordination"
  | "clock";
export type SessionStatus =
  | { readonly kind: "signed-out" }
  | { readonly kind: "restoring"; readonly accountId: string }
  | {
      readonly kind: "ready";
      readonly accountId: string;
      readonly profileId: string;
      readonly userId: string;
      readonly username: string;
    }
  | {
      readonly kind: "needs-login";
      readonly accountId: string;
      readonly profileId: string;
      readonly reason: LoginReason;
    }
  | {
      readonly kind: "error";
      readonly category: SessionError;
      readonly accountId?: string;
      readonly retryAfterMs?: number;
    };

export type LogoutOutcome = {
  readonly localSignedOut: true;
  readonly remoteRevocation: "confirmed" | "unconfirmed" | "not-attempted";
};

export class SessionIssue extends Error {
  constructor(readonly reason: LoginReason | "clock" | "coordination") {
    super("Session operation could not complete.");
    this.name = "SessionIssue";
  }
}
export function sessionError(error: unknown): SessionError {
  if (error instanceof StorageError) return `storage-${error.category}`;
  if (error instanceof SessionIssue)
    return error.reason === "invalid" ? "invalid-access" : error.reason;
  return authFailure(error);
}
function cancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new ApiError("cancelled");
}
function freshGrant(grant: SessionGrant, now: number) {
  if (
    Date.parse(grant.session_expires_at) <= now ||
    Date.parse(grant.access_token_expires_at) <= now
  )
    throw new SessionIssue("clock");
}
function qualifying401(error: unknown) {
  return (
    error instanceof ApiError &&
    error.metadata.status === 401 &&
    error.metadata.code === "auth.invalid_access_token"
  );
}

/** A caller can stop waiting without aborting a shared rotating refresh or its durable write. */
function waitForShared<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  cancelled(signal);
  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener("abort", abort);
      reject(new ApiError("cancelled"));
    };
    signal.addEventListener("abort", abort, { once: true });
    void promise.then(
      (result) => {
        signal.removeEventListener("abort", abort);
        resolve(result);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

/** One auth-state owner. Grants live only in scoped operations/vaults, never this snapshot. */
export class AuthenticationService {
  private status: SessionStatus = Object.freeze({ kind: "signed-out" });
  private listeners = new Set<() => void>();
  private publication = 0;
  private loginLifetime: AbortController | undefined;
  private readLifetime = new AbortController();
  private flights = new Map<string, Promise<void>>();
  private cleanupPending = new Set<string>();
  constructor(
    private readonly persistence: SessionPersistence,
    private readonly api: (profile: ServerProfile) => AuthApi,
    private readonly now: () => number = Date.now,
  ) {
    persistence.state.subscribe(() => {
      this.suspend();
      void this.restoreSelected(new AbortController().signal);
    });
    persistence.state.subscribeAccountInvalidation((accountId) => {
      if ("accountId" in this.status && this.status.accountId === accountId) {
        const profileId =
          this.status.kind === "ready" || this.status.kind === "needs-login"
            ? this.status.profileId
            : undefined;
        this.suspend();
        if (profileId)
          this.publish({
            kind: "needs-login",
            accountId,
            profileId,
            reason: "missing",
          });
      }
    });
    persistence.state.subscribeCommitted(() => {
      const publication = this.publication;
      void persistence.state
        .load()
        .then((state) => {
          const status = this.status;
          if (publication !== this.publication || !("accountId" in status)) return;
          if (
            !state.accounts.some((a) => a.id === status.accountId) ||
            state.selectedAccountId === null
          )
            this.publish({ kind: "signed-out" });
          else if (status.kind === "ready" && state.selectedAccountId !== status.accountId)
            this.publish({ kind: "signed-out" });
        })
        .catch(() => {
          /* The initiating operation/next explicit restore owns the safe storage error. */
        });
    });
  }
  getSnapshot = (): SessionStatus => this.status;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(status: SessionStatus) {
    this.status = Object.freeze(status);
    for (const listener of this.listeners) listener();
  }
  private suspend() {
    this.publication++;
    this.loginLifetime?.abort();
    this.readLifetime.abort();
    this.readLifetime = new AbortController();
    this.publish({ kind: "signed-out" });
    return this.publication;
  }
  /** Presentation-only fence for account-scoped reads; never contains a bearer. */
  activeContext() {
    if (this.status.kind !== "ready") return null;
    return Object.freeze({
      accountId: this.status.accountId,
      profileId: this.status.profileId,
      userId: this.status.userId,
      epoch: this.publication,
      signal: this.readLifetime.signal,
    });
  }
  async isCurrent(context: NonNullable<ReturnType<AuthenticationService["activeContext"]>>) {
    if (
      context.signal.aborted ||
      context.epoch !== this.publication ||
      this.status.kind !== "ready" ||
      this.status.accountId !== context.accountId
    )
      return false;
    const state = await this.persistence.state.load();
    return (
      !context.signal.aborted &&
      context.epoch === this.publication &&
      this.status.kind === "ready" &&
      this.status.accountId === context.accountId &&
      state.selectedAccountId === context.accountId
    );
  }
  async switchAccount(id: string | null): Promise<SessionStatus> {
    const publication = this.suspend();
    try {
      this.supported();
      const snapshot = await this.persistence.state.load();
      await this.persistence.state.update((draft) => {
        if (id !== null && !draft.accounts.some((a) => a.id === id))
          throw new StorageError("conflict");
        draft.selectedAccountId = id;
      }, snapshot.revision);
      if (publication === this.publication && id !== null)
        return this.restoreSelected(new AbortController().signal);
    } catch (error) {
      if (publication === this.publication)
        this.publish({ kind: "error", category: sessionError(error) });
      throw error;
    }
    return this.status;
  }
  private invalidateTarget(id: string) {
    if ("accountId" in this.status && this.status.accountId === id) this.suspend();
  }
  async logoutAccount(id: string): Promise<LogoutOutcome> {
    this.supported();
    this.cleanupPending.add(id);
    this.invalidateTarget(id);
    // No component signal: once cleanup starts, unmount cannot interrupt durable work.
    const captured = await this.persistence.accountOperation(
      id,
      async (lease) => {
        const state = await this.persistence.state.load();
        const account = state.accounts.find((a) => a.id === id);
        const profile = state.serverProfiles.find((p) => p.id === account?.serverProfileId);
        if (!account || !profile) throw new StorageError("conflict");
        let bearer: { token: string; expires: number; api: AuthApi } | undefined;
        try {
          const envelope = await this.persistence.read(account, lease);
          if (
            envelope &&
            matchesAccount(envelope, account) &&
            !state.authOperations.some((op) => op.accountId === id)
          ) {
            bearer = {
              token: envelope.grant.access_token,
              expires: Math.min(
                Date.parse(envelope.grant.access_token_expires_at),
                Date.parse(envelope.grant.session_expires_at),
              ),
              api: this.api(profile),
            };
          }
        } catch (error) {
          if (!(error instanceof StorageError) || error.category !== "corrupt") throw error;
        }
        await this.persistence.clearSession(id, lease);
        return bearer;
      },
      true,
    );
    this.cleanupPending.delete(id);
    if (!captured || captured.expires - this.now() <= 5_000)
      return { localSignedOut: true, remoteRevocation: "not-attempted" };
    try {
      await captured.api.revokeSession(captured.token, { timeoutMs: 3000 });
      return { localSignedOut: true, remoteRevocation: "confirmed" };
    } catch {
      return { localSignedOut: true, remoteRevocation: "unconfirmed" };
    }
  }
  async removeSavedAccount(id: string) {
    this.supported();
    this.cleanupPending.add(id);
    this.invalidateTarget(id);
    const state = await this.persistence.profiles().removeAccount(id);
    this.cleanupPending.delete(id);
    return state;
  }
  async forgetServer(id: string, revision?: number) {
    this.supported();
    const state = await this.persistence.state.load();
    const ids = state.accounts.filter((a) => a.serverProfileId === id).map((a) => a.id);
    for (const accountId of ids) this.cleanupPending.add(accountId);
    const selected = state.accounts.find((a) => a.id === state.selectedAccountId);
    if (selected?.serverProfileId === id) this.invalidateTarget(selected.id);
    const next = await this.persistence.profiles().forgetProfile(id, revision);
    for (const accountId of ids) this.cleanupPending.delete(accountId);
    return next;
  }
  private supported() {
    if (!this.persistence.locks.supported) throw new SessionIssue("coordination");
  }
  async profile(profileId: string): Promise<ServerProfile> {
    const profile = (await this.persistence.state.load()).serverProfiles.find(
      (p) => p.id === profileId,
    );
    if (!profile) throw new StorageError("conflict");
    return profile;
  }
  async register(
    profileId: string,
    username: string,
    password: string,
    signal: AbortSignal,
  ): Promise<UserIdentity> {
    cancelled(signal);
    const profile = await this.profile(profileId);
    cancelled(signal);
    // Registration is intentionally not a local account/session operation.
    const user = await this.api(profile).register(username, password, { signal });
    cancelled(signal);
    return user;
  }
  async login(
    profileId: string,
    username: string,
    password: string,
    signal: AbortSignal,
    expectedAccountId?: string,
  ): Promise<SessionStatus> {
    this.supported();
    const previous = this.status;
    this.suspend();
    const lifetime = new AbortController();
    this.loginLifetime = lifetime;
    const operationSignal = AbortSignal.any([signal, lifetime.signal]);
    const publication = ++this.publication;
    let cleanup: { api: AuthApi; accessToken: string } | undefined;
    let persistenceStarted = false;
    try {
      cancelled(operationSignal);
      const profile = await this.profile(profileId);
      const api = this.api(profile);
      const grant = await api.login(username, password, { signal: operationSignal });
      cleanup = { api, accessToken: grant.access_token };
      cancelled(operationSignal);
      freshGrant(grant, this.now());
      // No user ID can be inferred from the login grant or submitted username.
      // An expired initial grant cannot be refreshed without a journal-bound identity.
      const user = await api.currentUser(grant.access_token, { signal: operationSignal });
      cancelled(operationSignal);
      if (user.disabled_at) throw new SessionIssue("disabled");
      if (expectedAccountId) {
        const expected = (await this.persistence.state.load()).accounts.find(
          (a) => a.id === expectedAccountId,
        );
        if (
          !expected ||
          expected.serverProfileId !== profileId ||
          expected.serverUserId !== user.id
        )
          throw new SessionIssue("identity");
      }
      cancelled(operationSignal);
      persistenceStarted = true;
      const account = await this.persistence.saveLogin(
        profileId,
        user,
        grant,
        operationSignal,
        expectedAccountId,
      );
      cancelled(operationSignal);
      const latest = await this.persistence.state.load();
      if (
        publication !== this.publication ||
        latest.selectedAccountId !== account.id ||
        latest.accounts.find((a) => a.id === account.id)?.session?.operationId !==
          account.session?.operationId
      )
        throw new StorageError("conflict");
      this.publish({
        kind: "ready",
        accountId: account.id,
        profileId,
        userId: user.id,
        username: user.username,
      });
      this.cleanupPending.delete(account.id);
      return this.status;
    } catch (error) {
      if (cleanup && !persistenceStarted) {
        try {
          await cleanup.api.revokeUncommitted(cleanup.accessToken, { timeoutMs: 3000 });
        } catch {
          /* No success claim or replay: this fresh session may remain until server expiry. */
        }
      }
      if (publication === this.publication) {
        if (this.status.kind === "restoring")
          this.publish({ kind: "error", category: "cancelled" });
        else if (previous.kind === "ready") {
          const active = previous;
          try {
            const latest = await this.persistence.state.load();
            if (latest.authOperations.some((op) => op.accountId === active.accountId))
              this.publish({
                kind: "needs-login",
                accountId: active.accountId,
                profileId: active.profileId,
                reason: "recovery-required",
              });
            else if (latest.selectedAccountId !== active.accountId)
              this.publish({
                kind: "error",
                accountId: active.accountId,
                category: "storage-conflict",
              });
          } catch {
            this.publish({
              kind: "error",
              category: "storage-unavailable",
              accountId: active.accountId,
            });
          }
        }
      }
      throw error;
    } finally {
      if (this.loginLifetime === lifetime) this.loginLifetime = undefined;
    }
  }
  private async context(accountId: string, lease: OperationLease) {
    await lease.check();
    await this.persistence.reconcileOne(accountId, lease);
    const state = await this.persistence.state.load();
    const account = state.accounts.find((a) => a.id === accountId);
    if (!account) throw new SessionIssue("missing");
    const profile = state.serverProfiles.find((p) => p.id === account.serverProfileId);
    if (!profile) throw new SessionIssue("identity");
    if (state.authOperations.some((op) => op.accountId === accountId))
      throw new SessionIssue("recovery-required");
    if (!account.session) throw new SessionIssue("missing");
    const envelope = await this.persistence.read(account, lease);
    if (!envelope || !matchesAccount(envelope, account)) throw new SessionIssue("missing");
    if (Date.parse(envelope.grant.session_expires_at) <= this.now())
      throw new SessionIssue("expired");
    return { account, profile, envelope };
  }
  private async rotate(
    account: AccountRecord,
    profile: ServerProfile,
    envelope: SessionEnvelope,
    lease: OperationLease,
    beforeSendSignal?: AbortSignal,
  ) {
    await checkpoint(lease, beforeSendSignal);
    if (Date.parse(envelope.grant.session_expires_at) <= this.now())
      throw new SessionIssue("expired");
    const intent = await this.persistence.prepareRefresh(account, envelope, lease);
    let sent = false;
    try {
      await checkpoint(lease, beforeSendSignal);
      await this.persistence.markSent(intent, lease);
      sent = true;
      await checkpoint(lease, beforeSendSignal);
      // One POST only. Once sent, a consumer cancellation must not discard a valid rotated grant.
      const grant = await this.api(profile).refresh(envelope.grant.refresh_token, {
        timeoutMs: 15_000,
      });
      await lease.check();
      if (
        grant.session_id !== envelope.grant.session_id ||
        Date.parse(grant.session_expires_at) > Date.parse(envelope.grant.session_expires_at)
      )
        throw new SessionIssue("identity");
      if (grant.refresh_token === envelope.grant.refresh_token)
        throw new ApiError("invalid-response");
      freshGrant(grant, this.now());
      const next: SessionEnvelope = {
        ...envelope,
        grant,
        generation: intent.targetGeneration,
        operationId: intent.operationId,
      };
      await this.persistence.persist(intent, next, lease);
      return next;
    } catch (error) {
      if (sent) {
        try {
          await this.persistence.reconcileOne(account.id, lease);
        } catch {
          /* The original durable sent marker itself blocks unsafe replay after restart. */
        }
      }
      throw error;
    }
  }
  async refreshAccount(accountId: string, signal?: AbortSignal): Promise<void> {
    this.supported();
    cancelled(signal);
    const account = (await this.persistence.state.load()).accounts.find((a) => a.id === accountId);
    cancelled(signal);
    if (!account?.session) throw new SessionIssue("missing");
    const generation = account.session.generation;
    const key = `${accountId}:${account.session.sessionId}:${generation}`;
    let flight = this.flights.get(key);
    if (!flight) {
      const publication = this.publication;
      const work = this.persistence.accountOperation(
        accountId,
        async (lease) => {
          const context = await this.context(accountId, lease);
          // A different tab/process may already have confirmed and persisted renewal.
          if (context.envelope.generation !== generation) return;
          await this.rotate(context.account, context.profile, context.envelope, lease);
        },
        true,
      );
      flight = work.finally(() => {
        if (this.flights.get(key) === flight) this.flights.delete(key);
      });
      this.flights.set(key, flight);
      // A sole waiter may cancel before attaching. Keep the shared operation observed.
      void flight.catch(async () => {
        if (
          publication !== this.publication ||
          this.status.kind !== "ready" ||
          this.status.accountId !== accountId
        )
          return;
        const active = this.status;
        try {
          const state = await this.persistence.state.load();
          if (
            publication === this.publication &&
            state.authOperations.some((op) => op.accountId === accountId)
          )
            this.publish({
              kind: "needs-login",
              accountId,
              profileId: active.profileId,
              reason: "recovery-required",
            });
        } catch {
          if (publication === this.publication)
            this.publish({ kind: "error", category: "storage-unavailable", accountId });
        }
      });
    }
    return waitForShared(flight, signal);
  }
  async currentUser(accountId: string, signal?: AbortSignal): Promise<UserIdentity> {
    this.supported();
    cancelled(signal);
    return this.persistence.accountOperation(
      accountId,
      async (lease) => {
        await checkpoint(lease, signal);
        const context = await this.context(accountId, lease);
        let envelope = context.envelope;
        let refreshed = false;
        if (Date.parse(envelope.grant.access_token_expires_at) - this.now() <= 5_000) {
          envelope = await this.rotate(context.account, context.profile, envelope, lease, signal);
          refreshed = true;
        }
        await checkpoint(lease, signal);
        let user: UserIdentity;
        try {
          user = await this.api(context.profile).currentUser(envelope.grant.access_token, {
            signal,
          });
        } catch (error) {
          if (!qualifying401(error) || refreshed) throw error;
          envelope = await this.rotate(context.account, context.profile, envelope, lease, signal);
          await checkpoint(lease, signal);
          // The only automatic request replay is this idempotent GET, exactly once.
          user = await this.api(context.profile).currentUser(envelope.grant.access_token, {
            signal,
          });
        }
        await checkpoint(lease, signal);
        if (user.id !== context.account.serverUserId) throw new SessionIssue("identity");
        if (user.disabled_at) throw new SessionIssue("disabled");
        if (user.username !== context.account.username) {
          await this.persistence.state.load();
          await this.persistence.state.update(async (draft) => {
            await lease.check();
            const row = draft.accounts.find((a) => a.id === accountId);
            if (!row || !matchesAccount(envelope, row)) throw new StorageError("conflict");
            row.username = user.username;
            row.updatedAt = new Date().toISOString();
          });
        }
        return user;
      },
      true,
    );
  }
  reconcileSelected(signal: AbortSignal) {
    if (this.loginLifetime || this.status.kind === "restoring") return Promise.resolve(this.status);
    return this.restoreSelected(signal);
  }
  async restoreSelected(signal: AbortSignal): Promise<SessionStatus> {
    const publication = this.suspend();
    signal = AbortSignal.any([signal, this.readLifetime.signal]);
    let account: AccountRecord | undefined;
    try {
      cancelled(signal);
      const state = await this.persistence.state.load();
      account = state.accounts.find((a) => a.id === state.selectedAccountId);
      if (account && this.cleanupPending.has(account.id)) throw new StorageError("write-failed");
      // Reconcile unregistered orphans even when there is no selected account, but
      // never let an unrelated established account error invalidate this identity.
      for (const op of state.authOperations.filter(
        (intent) => !state.accounts.some((a) => a.id === intent.accountId),
      )) {
        try {
          // oxlint-disable-next-line no-await-in-loop -- Cross-store reconciliation is intentionally sequential.
          await this.persistence.accountOperation(op.accountId, (lease) =>
            this.persistence.reconcileOne(op.accountId, lease),
          );
        } catch (error) {
          // An unrelated orphan remains journaled for a later attempt; never let
          // its vault or lock failure invalidate the selected account.
          if (!account) throw error;
        }
      }
      if (!account) {
        if (publication === this.publication && !signal.aborted)
          this.publish({ kind: "signed-out" });
        return this.status;
      }
      this.supported();
      if (publication === this.publication)
        this.publish({ kind: "restoring", accountId: account.id });
      const user = await this.currentUser(account.id, signal);
      cancelled(signal);
      const latest = await this.persistence.state.load();
      if (latest.selectedAccountId !== account.id) throw new StorageError("conflict");
      if (publication === this.publication)
        this.publish({
          kind: "ready",
          accountId: account.id,
          profileId: account.serverProfileId,
          userId: user.id,
          username: user.username,
        });
    } catch (error) {
      if (publication !== this.publication || signal.aborted) return this.status;
      const failure = authFailure(error);
      const reason =
        error instanceof SessionIssue && error.reason !== "clock" && error.reason !== "coordination"
          ? error.reason
          : failure === "disabled"
            ? "disabled"
            : failure === "invalid-refresh" || failure === "invalid-access"
              ? "invalid"
              : undefined;
      if (account && reason)
        this.publish({
          kind: "needs-login",
          accountId: account.id,
          profileId: account.serverProfileId,
          reason,
        });
      else
        this.publish({
          kind: "error",
          category: sessionError(error),
          ...(account ? { accountId: account.id } : {}),
          ...(error instanceof ApiError && error.metadata.retryAfterMs !== undefined
            ? { retryAfterMs: error.metadata.retryAfterMs }
            : {}),
        });
    }
    return this.status;
  }
}
