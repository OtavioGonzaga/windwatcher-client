import { groupDraft } from "./group-validation";
import type { GroupScope } from "./group-validation";

const WINDOW_MS = 24 * 60 * 60 * 1000;

export class GroupAttemptExpired extends Error {}

/** Transient, immutable semantic input. Never serialize or log an attempt. */
export class GroupOperation {
  readonly scope: Readonly<GroupScope>;
  readonly #body;
  readonly #key = crypto.randomUUID();
  readonly #started: number;
  #last: number;
  #stopped = false;
  #sending = false;

  constructor(scope: GroupScope, title: string, ids: readonly string[], now = Date.now()) {
    if (!Number.isFinite(now)) throw new GroupAttemptExpired();
    this.scope = Object.freeze({
      profileId: scope.profileId,
      accountId: scope.accountId,
      userId: scope.userId,
      epoch: scope.epoch,
    });
    const draft = groupDraft(title, ids, scope.userId);
    this.#body = Object.freeze({ ...draft, participant_ids: Object.freeze(draft.participant_ids) });
    this.#started = this.#last = now;
  }
  get title() {
    return this.#body.title;
  }
  get participantIds(): readonly string[] {
    return this.#body.participant_ids;
  }
  matches(scope: GroupScope): boolean {
    return (
      this.scope.profileId === scope.profileId &&
      this.scope.accountId === scope.accountId &&
      this.scope.userId === scope.userId &&
      this.scope.epoch === scope.epoch
    );
  }
  eligible(now = Date.now()): boolean {
    if (!Number.isFinite(now) || now < this.#last || now - this.#started >= WINDOW_MS)
      this.#stopped = true;
    this.#last = now;
    return !this.#stopped;
  }
  stop() {
    this.#stopped = true;
  }
  async dispatch<T>(
    scope: GroupScope,
    send: (
      body: { kind: "group"; title: string; participant_ids: readonly string[] },
      key: string,
    ) => Promise<T>,
    now = Date.now(),
  ): Promise<T> {
    if (!this.matches(scope) || !this.eligible(now)) throw new GroupAttemptExpired();
    if (this.#sending) throw new Error("Group operation already sending.");
    this.#sending = true;
    try {
      return await send(this.#body, this.#key);
    } finally {
      this.#sending = false;
    }
  }
}
