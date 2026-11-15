export type LockKind = 'read' | 'write';

export const lockEnd = 0xffff_ffff_ffff_ffffn;

export interface LockOwner {
  readonly session: string;
  readonly owner: bigint;
}

export interface LockSpec {
  readonly ino: number;
  readonly owner: LockOwner;
  readonly kind: LockKind;
  readonly start: bigint;
  readonly end: bigint;
  readonly pid: number;
  readonly flock: boolean;
}

export type LockRequest = LockSpec & {
  readonly id: number;
  readonly wait: boolean;
};

export type LockGrant = LockSpec & { readonly id: number };

export interface LockRelease {
  readonly granted: readonly LockGrant[];
  readonly cancelled: readonly number[];
}

type LockVerdict =
  | { readonly status: 'granted' }
  | { readonly status: 'waiting' }
  | { readonly status: 'conflict'; readonly conflict: LockSpec }
  | { readonly status: 'deadlock' };

export type LockOutcome = LockVerdict & { readonly released: LockRelease };

export interface LockQuery {
  readonly ino: number;
  readonly owner: LockOwner;
  readonly kind: LockKind;
  readonly start: bigint;
  readonly end: bigint;
  readonly flock: boolean;
}

export interface LockReclaim {
  readonly held: readonly LockSpec[];
  readonly lost: readonly LockSpec[];
  readonly released: LockRelease;
}

interface MutableLock {
  ino: number;
  owner: LockOwner;
  kind: LockKind;
  start: bigint;
  end: bigint;
  pid: number;
  flock: boolean;
}

type Waiter = MutableLock & { id: number };

interface InodeLocks {
  granted: MutableLock[];
  waiting: Waiter[];
}

interface Session {
  expiresAt: number | null;
}

const emptyRelease: LockRelease = { granted: [], cancelled: [] };

function ownerKey(owner: LockOwner): string {
  return `${owner.session}\u0000${owner.owner.toString()}`;
}

function sameOwner(a: LockOwner, b: LockOwner): boolean {
  return a.owner === b.owner && a.session === b.session;
}

function overlaps(a: { start: bigint; end: bigint }, b: { start: bigint; end: bigint }): boolean {
  return a.start <= b.end && b.start <= a.end;
}

function conflicts(a: LockSpec, b: LockSpec): boolean {
  return (
    a.flock === b.flock &&
    !sameOwner(a.owner, b.owner) &&
    overlaps(a, b) &&
    (a.kind === 'write' || b.kind === 'write')
  );
}

function snapshot(lock: LockSpec): LockSpec {
  return {
    ino: lock.ino,
    owner: lock.owner,
    kind: lock.kind,
    start: lock.start,
    end: lock.end,
    pid: lock.pid,
    flock: lock.flock,
  };
}

interface Cut {
  readonly owner: LockOwner;
  readonly flock: boolean;
  readonly start: bigint;
  readonly end: bigint;
}

export interface LockRange {
  readonly start: bigint;
  readonly end: bigint;
  readonly flock: boolean;
}

function subtract(locks: readonly MutableLock[], cut: Cut): MutableLock[] {
  const { owner, flock, start, end } = cut;
  const kept: MutableLock[] = [];
  for (const lock of locks) {
    if (!sameOwner(lock.owner, owner) || lock.flock !== flock || !overlaps(lock, { start, end })) {
      kept.push(lock);
      continue;
    }
    if (lock.start < start) kept.push({ ...lock, end: start - 1n });
    if (lock.end > end) kept.push({ ...lock, start: end + 1n });
  }
  return kept;
}

function merge(locks: readonly MutableLock[], inserted: MutableLock): MutableLock[] {
  const mine: MutableLock[] = [];
  const others: MutableLock[] = [];
  for (const lock of locks) {
    if (
      sameOwner(lock.owner, inserted.owner) &&
      lock.flock === inserted.flock &&
      lock.kind === inserted.kind
    ) {
      mine.push(lock);
    } else {
      others.push(lock);
    }
  }
  mine.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  const merged: MutableLock[] = [];
  for (const lock of mine) {
    const last = merged[merged.length - 1];
    if (last && lock.start <= last.end + 1n) {
      if (lock.end > last.end) last.end = lock.end;
      if (lock === inserted) last.pid = inserted.pid;
    } else {
      merged.push({ ...lock });
    }
  }
  return [...others, ...merged];
}

export class LockTable {
  readonly #leaseMs: number;
  readonly #inodes = new Map<number, InodeLocks>();
  readonly #sessions = new Map<string, Session>();
  readonly #requests = new Map<number, Waiter>();

  constructor(leaseMs: number) {
    this.#leaseMs = leaseMs;
  }

  get leaseMs(): number {
    return this.#leaseMs;
  }

  connect(session: string): void {
    this.#sessions.set(session, { expiresAt: null });
  }

  disconnect(session: string, nowMs: number): void {
    const known = this.#sessions.get(session);
    if (known) known.expiresAt = nowMs + this.#leaseMs;
  }

  expire(nowMs: number): LockRelease {
    const expired: string[] = [];
    for (const [session, state] of this.#sessions) {
      if (state.expiresAt !== null && state.expiresAt <= nowMs) {
        expired.push(session);
      }
    }
    return this.#merge(expired.map((session) => this.releaseSession(session)));
  }

  setLock(request: LockRequest): LockOutcome {
    this.#touch(request.owner.session);
    const released: LockRelease[] = [];
    if (request.flock) {
      released.push(
        this.#unlockRange(request.ino, request.owner, { start: 0n, end: lockEnd, flock: true }),
      );
    }
    const conflict = this.#firstConflict(request);
    if (!conflict) {
      this.#apply(request);
      released.push(this.#settle(request.ino));
      return { status: 'granted', released: this.#merge(released) };
    }
    const outcome = this.#blocked(request, conflict);
    return { ...outcome, released: this.#merge(released) };
  }

  unlock(ino: number, owner: LockOwner, range: LockRange): LockRelease {
    return this.#unlockRange(ino, owner, range);
  }

  releaseOwner(owner: LockOwner): LockRelease {
    return this.#releaseWhere((candidate) => sameOwner(candidate, owner));
  }

  releaseSession(session: string): LockRelease {
    this.#sessions.delete(session);
    return this.#releaseWhere((candidate) => candidate.session === session);
  }

  cancel(id: number): LockRelease | null {
    const waiter = this.#requests.get(id);
    if (!waiter) return null;
    const state = this.#inodes.get(waiter.ino);
    if (state) state.waiting = state.waiting.filter((entry) => entry.id !== id);
    this.#requests.delete(id);
    return this.#merge([{ granted: [], cancelled: [id] }, this.#settle(waiter.ino)]);
  }

  getLock(query: LockQuery): LockSpec | null {
    const state = this.#inodes.get(query.ino);
    if (!state) return null;
    const probe: LockSpec = { ...query, pid: 0 };
    let found: MutableLock | null = null;
    for (const lock of state.granted) {
      if (!conflicts(lock, probe)) continue;
      if (!found || lock.start < found.start) found = lock;
    }
    return found ? snapshot(found) : null;
  }

  reclaim(session: string, previous: string | null, locks: readonly LockSpec[]): LockReclaim {
    this.#touch(session);
    const touched = new Set<number>();
    const cancelled: number[] = [];
    if (previous !== null && previous !== session) {
      this.#sessions.delete(previous);
      for (const [ino, state] of this.#inodes) {
        const before = state.granted.length + state.waiting.length;
        cancelled.push(...this.#dropWaiters(state, (waiter) => waiter.owner.session === previous));
        state.granted = state.granted.filter((lock) => lock.owner.session !== previous);
        if (before !== state.granted.length + state.waiting.length) {
          touched.add(ino);
        }
      }
    }
    const held: LockSpec[] = [];
    const lost: LockSpec[] = [];
    for (const lock of locks) {
      const spec: LockSpec = { ...lock, owner: { ...lock.owner, session } };
      if (this.#firstConflict(spec)) {
        lost.push(snapshot(lock));
        continue;
      }
      this.#apply(spec);
      touched.add(spec.ino);
      held.push(snapshot(spec));
    }
    const grants: LockRelease[] = [{ granted: [], cancelled }];
    for (const ino of touched) grants.push(this.#settle(ino));
    return { held, lost, released: this.#merge(grants) };
  }

  holders(ino: number): readonly LockSpec[] {
    return (this.#inodes.get(ino)?.granted ?? []).map(snapshot);
  }

  waiters(ino: number): readonly LockGrant[] {
    return (this.#inodes.get(ino)?.waiting ?? []).map((waiter) => ({
      ...snapshot(waiter),
      id: waiter.id,
    }));
  }

  inodes(): readonly number[] {
    return [...this.#inodes.keys()];
  }

  #touch(session: string): void {
    if (!this.#sessions.has(session)) this.connect(session);
  }

  #state(ino: number): InodeLocks {
    let state = this.#inodes.get(ino);
    if (!state) {
      state = { granted: [], waiting: [] };
      this.#inodes.set(ino, state);
    }
    return state;
  }

  #prune(ino: number): void {
    const state = this.#inodes.get(ino);
    if (state?.granted.length === 0 && state.waiting.length === 0) {
      this.#inodes.delete(ino);
    }
  }

  #firstConflict(spec: LockSpec): MutableLock | null {
    const state = this.#inodes.get(spec.ino);
    if (!state) return null;
    let found: MutableLock | null = null;
    for (const lock of state.granted) {
      if (!conflicts(lock, spec)) continue;
      if (!found || lock.start < found.start) found = lock;
    }
    return found;
  }

  #apply(spec: LockSpec): void {
    const state = this.#state(spec.ino);
    const inserted: MutableLock = { ...spec };
    const trimmed = subtract(state.granted, spec);
    state.granted = merge([...trimmed, inserted], inserted);
  }

  #blocked(request: LockRequest, conflict: MutableLock): LockVerdict {
    if (!request.wait) {
      this.#prune(request.ino);
      return { status: 'conflict', conflict: snapshot(conflict) };
    }
    if (this.#wouldDeadlock(request)) {
      this.#prune(request.ino);
      return { status: 'deadlock' };
    }
    const waiter: Waiter = { ...request };
    this.#state(request.ino).waiting.push(waiter);
    this.#requests.set(request.id, waiter);
    return { status: 'waiting' };
  }

  #blockersOf(spec: LockSpec): LockOwner[] {
    const state = this.#inodes.get(spec.ino);
    if (!state) return [];
    return state.granted.filter((lock) => conflicts(lock, spec)).map((lock) => lock.owner);
  }

  #wouldDeadlock(request: LockSpec): boolean {
    const target = ownerKey(request.owner);
    const visited = new Set<string>();
    const stack = this.#blockersOf(request);
    while (stack.length > 0) {
      const next = stack.pop();
      if (!next) break;
      const key = ownerKey(next);
      if (key === target) return true;
      if (visited.has(key)) continue;
      visited.add(key);
      for (const waiter of this.#requests.values()) {
        if (ownerKey(waiter.owner) !== key) continue;
        stack.push(...this.#blockersOf(waiter));
      }
    }
    return false;
  }

  #unlockRange(ino: number, owner: LockOwner, range: LockRange): LockRelease {
    const state = this.#inodes.get(ino);
    if (!state) return emptyRelease;
    state.granted = subtract(state.granted, { owner, ...range });
    return this.#settle(ino);
  }

  #dropWaiters(state: InodeLocks, drop: (waiter: Waiter) => boolean): number[] {
    const cancelled: number[] = [];
    for (let index = state.waiting.length - 1; index >= 0; index -= 1) {
      const waiter = state.waiting[index];
      if (!waiter || !drop(waiter)) continue;
      state.waiting.splice(index, 1);
      this.#requests.delete(waiter.id);
      cancelled.unshift(waiter.id);
    }
    return cancelled;
  }

  #releaseWhere(match: (owner: LockOwner) => boolean): LockRelease {
    const parts: LockRelease[] = [];
    for (const [ino, state] of [...this.#inodes]) {
      const cancelled = this.#dropWaiters(state, (waiter) => match(waiter.owner));
      const before = state.granted.length;
      state.granted = state.granted.filter((lock) => !match(lock.owner));
      parts.push({ granted: [], cancelled });
      if (cancelled.length > 0 || before !== state.granted.length) {
        parts.push(this.#settle(ino));
      } else {
        this.#prune(ino);
      }
    }
    return this.#merge(parts);
  }

  #settle(ino: number): LockRelease {
    const state = this.#inodes.get(ino);
    if (!state) return emptyRelease;
    const granted: LockGrant[] = [];
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (const [index, waiter] of state.waiting.entries()) {
        if (this.#firstConflict(waiter)) continue;
        state.waiting.splice(index, 1);
        this.#requests.delete(waiter.id);
        this.#apply(waiter);
        granted.push({ ...snapshot(waiter), id: waiter.id });
        progressed = true;
        break;
      }
    }
    this.#prune(ino);
    return { granted, cancelled: [] };
  }

  #merge(parts: readonly LockRelease[]): LockRelease {
    return {
      granted: parts.flatMap((part) => part.granted),
      cancelled: parts.flatMap((part) => part.cancelled),
    };
  }
}
