import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  lockEnd,
  LockTable,
  type LockKind,
  type LockOutcome,
  type LockOwner,
  type LockRequest,
  type LockSpec,
} from '../../../src/drive/mount/locks';

const a: LockOwner = { session: 's1', owner: 1n };
const b: LockOwner = { session: 's2', owner: 1n };
const c: LockOwner = { session: 's3', owner: 7n };

let nextId = 1;

function req(
  owner: LockOwner,
  kind: LockKind,
  span: readonly [bigint, bigint],
  options: { ino?: number; wait?: boolean; flock?: boolean; pid?: number } = {},
): LockRequest {
  return {
    id: nextId++,
    ino: options.ino ?? 1,
    owner,
    kind,
    start: span[0],
    end: span[1],
    pid: options.pid ?? 100,
    flock: options.flock ?? false,
    wait: options.wait ?? false,
  };
}

function ranges(
  table: LockTable,
  owner: LockOwner,
  ino = 1,
): (readonly [LockKind, bigint, bigint])[] {
  return table
    .holders(ino)
    .filter((lock) => lock.owner.owner === owner.owner && lock.owner.session === owner.session)
    .map((lock) => [lock.kind, lock.start, lock.end] as const)
    .sort((x, y) => (x[1] < y[1] ? -1 : 1));
}

function status(outcome: LockOutcome): string {
  return outcome.status;
}

describe('conflicts', () => {
  it('lets readers share and blocks writers', () => {
    const table = new LockTable(90_000);
    expect(status(table.setLock(req(a, 'read', [0n, 9n])))).toBe('granted');
    expect(status(table.setLock(req(b, 'read', [5n, 20n])))).toBe('granted');
    const blocked = table.setLock(req(c, 'write', [8n, 8n]));
    expect(blocked.status).toBe('conflict');
    expect(blocked.status === 'conflict' && blocked.conflict.start).toBe(0n);
    expect(status(table.setLock(req(c, 'write', [21n, 30n])))).toBe('granted');
  });

  it('never conflicts with itself and replaces its own range', () => {
    const table = new LockTable(90_000);
    table.setLock(req(a, 'read', [0n, 99n]));
    expect(status(table.setLock(req(a, 'write', [10n, 19n])))).toBe('granted');
    expect(ranges(table, a)).toEqual([
      ['read', 0n, 9n],
      ['write', 10n, 19n],
      ['read', 20n, 99n],
    ]);
  });

  it('keeps separate inodes independent', () => {
    const table = new LockTable(90_000);
    table.setLock(req(a, 'write', [0n, 9n], { ino: 1 }));
    expect(status(table.setLock(req(b, 'write', [0n, 9n], { ino: 2 })))).toBe('granted');
  });

  it('does not let flock and fcntl locks conflict', () => {
    const table = new LockTable(90_000);
    table.setLock(req(a, 'write', [0n, lockEnd]));
    expect(status(table.setLock(req(b, 'write', [0n, lockEnd], { flock: true })))).toBe('granted');
  });
});

describe('split and merge', () => {
  it('merges adjacent and overlapping ranges of one kind', () => {
    const table = new LockTable(90_000);
    table.setLock(req(a, 'write', [0n, 9n]));
    table.setLock(req(a, 'write', [10n, 19n]));
    table.setLock(req(a, 'write', [15n, 40n]));
    expect(ranges(table, a)).toEqual([['write', 0n, 40n]]);
  });

  it('keeps different kinds apart', () => {
    const table = new LockTable(90_000);
    table.setLock(req(a, 'write', [0n, 9n]));
    table.setLock(req(a, 'read', [10n, 19n]));
    expect(ranges(table, a)).toEqual([
      ['write', 0n, 9n],
      ['read', 10n, 19n],
    ]);
  });

  it('splits on a partial unlock', () => {
    const table = new LockTable(90_000);
    table.setLock(req(a, 'write', [0n, 99n]));
    table.unlock(1, a, { start: 40n, end: 59n, flock: false });
    expect(ranges(table, a)).toEqual([
      ['write', 0n, 39n],
      ['write', 60n, 99n],
    ]);
  });

  it('unlocks to end of file and drops empty inodes', () => {
    const table = new LockTable(90_000);
    table.setLock(req(a, 'write', [10n, lockEnd]));
    table.unlock(1, a, { start: 0n, end: lockEnd, flock: false });
    expect(table.holders(1)).toEqual([]);
    expect(table.inodes()).toEqual([]);
  });

  it('takes the pid of the newest lock when merging', () => {
    const table = new LockTable(90_000);
    table.setLock(req(a, 'write', [0n, 9n], { pid: 1 }));
    table.setLock(req(a, 'write', [10n, 19n], { pid: 2 }));
    expect(table.holders(1)[0]?.pid).toBe(2);
  });

  it('converts a flock by replacing it', () => {
    const table = new LockTable(90_000);
    table.setLock(req(a, 'read', [0n, lockEnd], { flock: true }));
    table.setLock(req(a, 'write', [0n, lockEnd], { flock: true }));
    expect(table.holders(1)).toHaveLength(1);
    expect(table.holders(1)[0]?.kind).toBe('write');
  });

  it('loses the old flock when a non-blocking conversion fails', () => {
    const table = new LockTable(90_000);
    table.setLock(req(a, 'read', [0n, lockEnd], { flock: true }));
    table.setLock(req(b, 'read', [0n, lockEnd], { flock: true }));
    expect(status(table.setLock(req(a, 'write', [0n, lockEnd], { flock: true })))).toBe('conflict');
    expect(ranges(table, a)).toEqual([]);
  });
});

describe('getLock', () => {
  it('reports the first conflicting lock and none when free', () => {
    const table = new LockTable(90_000);
    table.setLock(req(a, 'write', [50n, 59n], { pid: 42 }));
    table.setLock(req(a, 'write', [10n, 19n], { pid: 42 }));
    const query = {
      ino: 1,
      owner: b,
      kind: 'read' as const,
      start: 0n,
      end: 100n,
      flock: false,
    };
    expect(table.getLock(query)).toMatchObject({ start: 10n, end: 19n, pid: 42, kind: 'write' });
    expect(table.getLock({ ...query, owner: a })).toBeNull();
    expect(table.getLock({ ...query, start: 20n, end: 30n })).toBeNull();
    expect(table.getLock({ ...query, ino: 9 })).toBeNull();
  });

  it('ignores shared locks for a read query', () => {
    const table = new LockTable(90_000);
    table.setLock(req(a, 'read', [0n, 9n]));
    expect(
      table.getLock({ ino: 1, owner: b, kind: 'read', start: 0n, end: 9n, flock: false }),
    ).toBeNull();
  });
});

describe('wait queue', () => {
  it('grants waiters in order when the lock is released', () => {
    const table = new LockTable(90_000);
    table.setLock(req(a, 'write', [0n, 9n]));
    const w1 = req(b, 'write', [0n, 9n], { wait: true });
    const w2 = req(c, 'write', [0n, 9n], { wait: true });
    expect(status(table.setLock(w1))).toBe('waiting');
    expect(status(table.setLock(w2))).toBe('waiting');
    const first = table.unlock(1, a, { start: 0n, end: 9n, flock: false });
    expect(first.granted.map((grant) => grant.id)).toEqual([w1.id]);
    const second = table.unlock(1, b, { start: 0n, end: lockEnd, flock: false });
    expect(second.granted.map((grant) => grant.id)).toEqual([w2.id]);
  });

  it('grants every compatible reader at once', () => {
    const table = new LockTable(90_000);
    table.setLock(req(a, 'write', [0n, 9n]));
    const w1 = req(b, 'read', [0n, 9n], { wait: true });
    const w2 = req(c, 'read', [0n, 9n], { wait: true });
    table.setLock(w1);
    table.setLock(w2);
    const released = table.unlock(1, a, { start: 0n, end: lockEnd, flock: false });
    expect(released.granted.map((grant) => grant.id)).toEqual([w1.id, w2.id]);
    expect(table.holders(1)).toHaveLength(2);
  });

  it('grants a waiter after a downgrade', () => {
    const table = new LockTable(90_000);
    table.setLock(req(a, 'write', [0n, 9n]));
    const waiter = req(b, 'read', [0n, 9n], { wait: true });
    table.setLock(waiter);
    const downgrade = table.setLock(req(a, 'read', [0n, 9n]));
    expect(downgrade.released.granted.map((grant) => grant.id)).toEqual([waiter.id]);
  });

  it('grants a waiter only for the freed part of the range', () => {
    const table = new LockTable(90_000);
    table.setLock(req(a, 'write', [0n, 9n]));
    table.setLock(req(c, 'write', [20n, 29n]));
    const waiter = req(b, 'write', [0n, 29n], { wait: true });
    table.setLock(waiter);
    expect(table.unlock(1, a, { start: 0n, end: 9n, flock: false }).granted).toEqual([]);
    expect(
      table.unlock(1, c, { start: 20n, end: 29n, flock: false }).granted.map((g) => g.id),
    ).toEqual([waiter.id]);
  });

  it('cancels a waiter and answers its id', () => {
    const table = new LockTable(90_000);
    table.setLock(req(a, 'write', [0n, 9n]));
    const waiter = req(b, 'write', [0n, 9n], { wait: true });
    table.setLock(waiter);
    const released = table.cancel(waiter.id);
    expect(released?.cancelled).toEqual([waiter.id]);
    expect(table.waiters(1)).toEqual([]);
    expect(table.cancel(waiter.id)).toBeNull();
    expect(table.unlock(1, a, { start: 0n, end: lockEnd, flock: false }).granted).toEqual([]);
  });

  it('lets the next waiter in when the head is cancelled', () => {
    const table = new LockTable(90_000);
    table.setLock(req(a, 'read', [0n, 9n]));
    const head = req(b, 'write', [0n, 9n], { wait: true });
    const tail = req(c, 'read', [5n, 5n], { wait: false });
    table.setLock(head);
    expect(status(table.setLock(tail))).toBe('granted');
    const released = table.cancel(head.id);
    expect(released?.cancelled).toEqual([head.id]);
  });

  it("releases an owner's locks and cancels its waiters", () => {
    const table = new LockTable(90_000);
    table.setLock(req(a, 'write', [0n, 9n], { ino: 1 }));
    table.setLock(req(a, 'write', [0n, 9n], { ino: 2 }));
    const w1 = req(b, 'write', [0n, 9n], { ino: 1, wait: true });
    const w2 = req(a, 'write', [0n, 9n], { ino: 3, wait: true });
    table.setLock(req(c, 'write', [0n, 9n], { ino: 3 }));
    table.setLock(w1);
    table.setLock(w2);
    const released = table.releaseOwner(a);
    expect(released.granted.map((grant) => grant.id)).toEqual([w1.id]);
    expect(released.cancelled).toEqual([w2.id]);
    expect(table.holders(2)).toEqual([]);
  });

  it("gives a granted waiter's range replacement semantics", () => {
    const table = new LockTable(90_000);
    table.setLock(req(b, 'write', [0n, 9n]));
    table.setLock(req(a, 'read', [20n, 29n]));
    const waiter = req(a, 'read', [0n, 9n], { wait: false });
    expect(status(table.setLock(waiter))).toBe('conflict');
    const queued = req(a, 'read', [0n, 9n], { wait: true });
    table.setLock(queued);
    table.unlock(1, b, { start: 0n, end: lockEnd, flock: false });
    expect(ranges(table, a)).toEqual([
      ['read', 0n, 9n],
      ['read', 20n, 29n],
    ]);
  });
});

describe('deadlock', () => {
  it('answers deadlock for a two owner cycle', () => {
    const table = new LockTable(90_000);
    table.setLock(req(a, 'write', [0n, 9n], { ino: 1 }));
    table.setLock(req(b, 'write', [0n, 9n], { ino: 2 }));
    expect(status(table.setLock(req(a, 'write', [0n, 9n], { ino: 2, wait: true })))).toBe(
      'waiting',
    );
    const cycle = table.setLock(req(b, 'write', [0n, 9n], { ino: 1, wait: true }));
    expect(cycle.status).toBe('deadlock');
    expect(table.waiters(1)).toEqual([]);
  });

  it('answers deadlock for a three owner cycle', () => {
    const table = new LockTable(90_000);
    table.setLock(req(a, 'write', [0n, 0n], { ino: 1 }));
    table.setLock(req(b, 'write', [0n, 0n], { ino: 2 }));
    table.setLock(req(c, 'write', [0n, 0n], { ino: 3 }));
    expect(status(table.setLock(req(a, 'write', [0n, 0n], { ino: 2, wait: true })))).toBe(
      'waiting',
    );
    expect(status(table.setLock(req(b, 'write', [0n, 0n], { ino: 3, wait: true })))).toBe(
      'waiting',
    );
    expect(status(table.setLock(req(c, 'write', [0n, 0n], { ino: 1, wait: true })))).toBe(
      'deadlock',
    );
  });

  it('is not a deadlock when the chain has no cycle', () => {
    const table = new LockTable(90_000);
    table.setLock(req(a, 'write', [0n, 0n], { ino: 1 }));
    table.setLock(req(b, 'write', [0n, 0n], { ino: 2 }));
    expect(status(table.setLock(req(c, 'write', [0n, 0n], { ino: 2, wait: true })))).toBe(
      'waiting',
    );
    expect(status(table.setLock(req(b, 'write', [0n, 0n], { ino: 1, wait: true })))).toBe(
      'waiting',
    );
  });

  it('does not report a deadlock for a non-blocking request', () => {
    const table = new LockTable(90_000);
    table.setLock(req(a, 'write', [0n, 0n], { ino: 1 }));
    table.setLock(req(b, 'write', [0n, 0n], { ino: 2 }));
    table.setLock(req(a, 'write', [0n, 0n], { ino: 2, wait: true }));
    expect(status(table.setLock(req(b, 'write', [0n, 0n], { ino: 1, wait: false })))).toBe(
      'conflict',
    );
  });
});

describe('sessions', () => {
  it('keeps locks through a disconnect until the lease passes', () => {
    const table = new LockTable(90_000);
    table.setLock(req(a, 'write', [0n, 9n]));
    const waiter = req(b, 'write', [0n, 9n], { wait: true });
    table.setLock(waiter);
    table.disconnect('s1', 1_000);
    expect(table.expire(90_999)).toEqual({ granted: [], cancelled: [] });
    const released = table.expire(91_000);
    expect(released.granted.map((grant) => grant.id)).toEqual([waiter.id]);
    expect(ranges(table, a)).toEqual([]);
  });

  it('keeps a session whose connection resumed', () => {
    const table = new LockTable(90_000);
    table.setLock(req(a, 'write', [0n, 9n]));
    table.disconnect('s1', 0);
    table.connect('s1');
    table.expire(10_000_000);
    expect(ranges(table, a)).toHaveLength(1);
  });

  it('cancels the waiters of an expired session', () => {
    const table = new LockTable(1_000);
    table.setLock(req(a, 'write', [0n, 9n]));
    const waiter = req(b, 'write', [0n, 9n], { wait: true });
    table.setLock(waiter);
    table.disconnect('s2', 0);
    const released = table.expire(1_000);
    expect(released.cancelled).toEqual([waiter.id]);
    expect(ranges(table, a)).toHaveLength(1);
  });

  it('reports the lease', () => {
    expect(new LockTable(90_000).leaseMs).toBe(90_000);
  });

  it('reclaims locks nobody took after the lease expired', () => {
    const table = new LockTable(90_000);
    const held = req(a, 'write', [0n, 9n], { pid: 5 });
    table.setLock(held);
    table.disconnect('s1', 0);
    table.expire(90_000);
    const result = table.reclaim('s1b', 's1', [held]);
    expect(result.lost).toEqual([]);
    expect(result.held).toHaveLength(1);
    expect(table.holders(1)[0]?.owner.session).toBe('s1b');
  });

  it('reports a lock lost when another computer took it', () => {
    const table = new LockTable(90_000);
    const held = req(a, 'write', [0n, 9n]);
    table.setLock(held);
    table.disconnect('s1', 0);
    table.expire(90_000);
    table.setLock(req(b, 'write', [0n, 9n]));
    const result = table.reclaim('s1b', 's1', [held]);
    expect(result.held).toEqual([]);
    expect(result.lost).toHaveLength(1);
    expect(result.lost[0]?.owner.session).toBe('s1');
  });

  it('rebinds locks of a session that has not expired yet', () => {
    const table = new LockTable(90_000);
    const held = req(a, 'write', [0n, 9n]);
    table.setLock(held);
    const waiter = req(b, 'write', [0n, 9n], { wait: true });
    table.setLock(waiter);
    table.disconnect('s1', 0);
    const result = table.reclaim('s1b', 's1', [held]);
    expect(result.lost).toEqual([]);
    expect(result.released.granted).toEqual([]);
    expect(table.holders(1)[0]?.owner.session).toBe('s1b');
    expect(table.waiters(1)).toHaveLength(1);
  });

  it('grants a waiter when a reclaim does not hold a previous lock', () => {
    const table = new LockTable(90_000);
    table.setLock(req(a, 'write', [0n, 9n]));
    const waiter = req(b, 'write', [0n, 9n], { wait: true });
    table.setLock(waiter);
    const result = table.reclaim('s1b', 's1', []);
    expect(result.released.granted.map((grant) => grant.id)).toEqual([waiter.id]);
  });

  it('releases a session directly', () => {
    const table = new LockTable(90_000);
    table.setLock(req(a, 'write', [0n, 9n]));
    table.releaseSession('s1');
    expect(table.holders(1)).toEqual([]);
    expect(table.expire(Number.MAX_SAFE_INTEGER)).toEqual({ granted: [], cancelled: [] });
  });

  it('answers an unlock on an unknown inode', () => {
    const table = new LockTable(90_000);
    expect(table.unlock(5, a, { start: 0n, end: 9n, flock: false })).toEqual({
      granted: [],
      cancelled: [],
    });
    table.disconnect('nobody', 0);
    expect(table.holders(5)).toEqual([]);
  });
});

interface LockStep {
  op: 'lock';
  owner: number;
  kind: LockKind;
  start: bigint;
  length: bigint;
  ino: number;
  wait: boolean;
  flock: boolean;
}

type OpStep =
  | LockStep
  | { op: 'unlock'; owner: number; start: bigint; length: bigint; ino: number; flock: boolean }
  | { op: 'cancel'; owner: number; pick: number }
  | { op: 'release'; owner: number }
  | { op: 'expire'; owner: number };

interface ModelStep {
  kind: LockKind;
  start: bigint;
  length: bigint;
  unlock: boolean;
}

function expectModel(table: LockTable, model: Map<bigint, LockKind>): void {
  const actual = new Map<bigint, LockKind>();
  const held = table.holders(1);
  for (const lock of held) {
    for (let at = lock.start; at <= lock.end; at += 1n) {
      expect(actual.has(at)).toBe(false);
      actual.set(at, lock.kind);
    }
  }
  expect(actual).toEqual(model);
  for (const x of held) {
    for (const y of held) {
      if (x !== y && x.kind === y.kind) expect(x.end + 1n === y.start).toBe(false);
    }
  }
}

function checkModel(steps: readonly ModelStep[]): void {
  const table = new LockTable(10);
  const model = new Map<bigint, LockKind>();
  for (const step of steps) {
    const end = step.start + step.length;
    if (step.unlock) {
      table.unlock(1, a, { start: step.start, end, flock: false });
      for (let at = step.start; at <= end; at += 1n) model.delete(at);
    } else {
      table.setLock(req(a, step.kind, [step.start, end]));
      for (let at = step.start; at <= end; at += 1n) model.set(at, step.kind);
    }
    expectModel(table, model);
  }
}

describe('property', () => {
  const owners = [a, b, c, { session: 's4', owner: 9n }];
  const op: fc.Arbitrary<OpStep> = fc.oneof(
    fc.record({
      op: fc.constant('lock' as const),
      owner: fc.integer({ min: 0, max: 3 }),
      kind: fc.constantFrom<LockKind>('read', 'write'),
      start: fc.bigInt({ min: 0n, max: 30n }),
      length: fc.bigInt({ min: 0n, max: 20n }),
      ino: fc.integer({ min: 1, max: 2 }),
      wait: fc.boolean(),
      flock: fc.boolean(),
    }),
    fc.record({
      op: fc.constant('unlock' as const),
      owner: fc.integer({ min: 0, max: 3 }),
      start: fc.bigInt({ min: 0n, max: 30n }),
      length: fc.bigInt({ min: 0n, max: 20n }),
      ino: fc.integer({ min: 1, max: 2 }),
      flock: fc.boolean(),
    }),
    fc.record({
      op: fc.constant('cancel' as const),
      owner: fc.integer({ min: 0, max: 3 }),
      pick: fc.nat(),
    }),
    fc.record({
      op: fc.constant('release' as const),
      owner: fc.integer({ min: 0, max: 3 }),
    }),
    fc.record({
      op: fc.constant('expire' as const),
      owner: fc.integer({ min: 0, max: 3 }),
    }),
  );

  const clashes = (x: LockSpec, y: LockSpec): boolean =>
    x.flock === y.flock &&
    !(x.owner.session === y.owner.session && x.owner.owner === y.owner.owner) &&
    x.start <= y.end &&
    y.start <= x.end &&
    (x.kind === 'write' || y.kind === 'write');

  function assertSane(table: LockTable): void {
    for (const ino of table.inodes()) {
      const held = table.holders(ino);
      for (const [i, x] of held.entries()) {
        expect(x.start <= x.end).toBe(true);
        for (const y of held.slice(i + 1)) expect(clashes(x, y)).toBe(false);
      }
      for (const waiter of table.waiters(ino)) {
        expect(held.some((lock) => clashes(lock, waiter))).toBe(true);
      }
    }
  }

  class Harness {
    readonly table = new LockTable(10);
    readonly pending: number[] = [];
    clock = 0;

    settle(released: { granted: readonly { id: number }[]; cancelled: readonly number[] }): void {
      for (const id of [...released.granted.map((g) => g.id), ...released.cancelled]) {
        const at = this.pending.indexOf(id);
        if (at >= 0) this.pending.splice(at, 1);
      }
    }

    lock(owner: LockOwner, step: LockStep): void {
      const request = req(owner, step.kind, [step.start, step.start + step.length], {
        ino: step.ino,
        wait: step.wait,
        flock: step.flock,
      });
      const outcome = this.table.setLock(request);
      this.settle(outcome.released);
      if (outcome.status === 'waiting') this.pending.push(request.id);
    }

    cancel(pick: number): void {
      const id = this.pending[pick % Math.max(this.pending.length, 1)];
      const released = id === undefined ? null : this.table.cancel(id);
      if (released) this.settle(released);
    }

    expire(owner: LockOwner): void {
      this.table.disconnect(owner.session, this.clock);
      this.clock += 11;
      this.settle(this.table.expire(this.clock));
    }

    run(step: OpStep, owner: LockOwner): void {
      if (step.op === 'lock') this.lock(owner, step);
      else if (step.op === 'unlock') {
        const range = { start: step.start, end: step.start + step.length, flock: step.flock };
        this.settle(this.table.unlock(step.ino, owner, range));
      } else if (step.op === 'cancel') this.cancel(step.pick);
      else if (step.op === 'release') this.settle(this.table.releaseOwner(owner));
      else this.expire(owner);
    }

    check(): void {
      assertSane(this.table);
      const waiting = this.table
        .inodes()
        .flatMap((ino) => this.table.waiters(ino).map((w) => w.id));
      expect(waiting.sort()).toEqual([...this.pending].sort());
    }
  }

  it('never holds two conflicting locks and never leaves a grantable waiter', () => {
    fc.assert(
      fc.property(fc.array(op, { maxLength: 60 }), (ops) => {
        const harness = new Harness();
        for (const step of ops) {
          const owner = owners[step.owner % owners.length] ?? a;
          harness.run(step, owner);
          harness.check();
        }
      }),
      { numRuns: 300 },
    );
  });

  it("keeps each owner's own ranges disjoint and unmerged-adjacent per kind", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            kind: fc.constantFrom<LockKind>('read', 'write'),
            start: fc.bigInt({ min: 0n, max: 40n }),
            length: fc.bigInt({ min: 0n, max: 15n }),
            unlock: fc.boolean(),
          }),
          { maxLength: 40 },
        ),
        checkModel,
      ),
      { numRuns: 200 },
    );
  });
});
