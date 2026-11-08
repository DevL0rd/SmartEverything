import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_HUB,
  applyOp,
  conflictName,
  decideMove,
  decidePush,
  decideTombstone,
  entriesAfter,
  fallbackForMove,
  operationId,
  planOps,
  uniqueConflictPath,
  type ClientBase,
  type HubEntry,
  type HubState,
  type MoveOp,
  type PushOp,
  type SyncContext,
  type SyncOp,
  type SyncResult,
  type TombstoneOp,
} from '../../src/drive/sync/model';

const CTX: SyncContext = { device: 'laptop', at: Date.UTC(2026, 10, 7, 9, 5, 3) };

function live(rev: number, content: string, seq = rev): HubEntry {
  return { rev, deleted: false, content, seq };
}

function dead(rev: number, content: string, seq = rev): HubEntry {
  return { rev, deleted: true, content, seq };
}

function push(path: string, baseRev: number | null, content: string): PushOp {
  const body = { kind: 'push', path, baseRev, content } as const;
  return { ...body, opId: operationId('laptop', body) };
}

function tombstone(path: string, baseRev: number): TombstoneOp {
  const body = { kind: 'tombstone', path, baseRev } as const;
  return { ...body, opId: operationId('laptop', body) };
}

function move(from: string, to: string, baseRev: number): MoveOp {
  const body = { kind: 'move', from, to, baseRev } as const;
  return { ...body, opId: operationId('laptop', body) };
}

function run(
  ops: readonly SyncOp[],
  start: HubState = EMPTY_HUB,
): { readonly state: HubState; readonly results: readonly SyncResult[] } {
  let state = start;
  const results: SyncResult[] = [];
  for (const op of ops) {
    const outcome = applyOp(state, op, CTX);
    state = outcome.state;
    results.push(outcome.result);
  }
  return { state, results };
}

describe('push decision table', () => {
  it('accepts a new path, a matching base and a recreation over a tombstone', () => {
    expect(decidePush(undefined, null, 'x')).toBe('accept');
    expect(decidePush(live(3, 'a'), 3, 'b')).toBe('accept');
    expect(decidePush(dead(4, 'a'), null, 'b')).toBe('accept');
  });

  it('lets an edit beat a delete that the editor never saw', () => {
    expect(decidePush(dead(5, 'a'), 3, 'b')).toBe('accept');
  });

  it('refuses a stale base and a create over a live path', () => {
    expect(decidePush(live(4, 'a'), 3, 'b')).toBe('conflict');
    expect(decidePush(live(1, 'a'), null, 'b')).toBe('conflict');
  });

  it('treats identical content as nothing to do', () => {
    expect(decidePush(live(4, 'a'), 2, 'a')).toBe('noop');
  });
});

describe('tombstone and move decisions', () => {
  it('deletes only the revision the client saw', () => {
    expect(decideTombstone(live(2, 'a'), 2)).toBe('accept');
    expect(decideTombstone(live(3, 'a'), 2)).toBe('stale');
    expect(decideTombstone(dead(3, 'a'), 2)).toBe('noop');
    expect(decideTombstone(undefined, 2)).toBe('noop');
  });

  it('moves only an unchanged source onto a free target', () => {
    const op = { from: 'a', to: 'b', baseRev: 2 };
    expect(decideMove(live(2, 'x'), undefined, op)).toBe('accept');
    expect(decideMove(live(2, 'x'), dead(4, 'y'), op)).toBe('accept');
    expect(decideMove(live(3, 'x'), undefined, op)).toBe('conflict');
    expect(decideMove(dead(3, 'x'), undefined, op)).toBe('conflict');
    expect(decideMove(live(2, 'x'), live(1, 'y'), op)).toBe('conflict');
    expect(decideMove(live(2, 'x'), undefined, { ...op, to: 'a' })).toBe('conflict');
  });
});

describe('conflict names', () => {
  it('follows the documented pattern', () => {
    expect(conflictName('photos/cat.jpg', CTX.at, 'laptop')).toBe(
      'photos/cat.sync-conflict-20261107-090503-laptop.jpg',
    );
    expect(conflictName('notes', CTX.at, 'laptop')).toBe(
      'notes.sync-conflict-20261107-090503-laptop',
    );
    expect(conflictName('.env', CTX.at, 'laptop')).toBe(
      '.env.sync-conflict-20261107-090503-laptop',
    );
    expect(conflictName('a.tar.gz', CTX.at, 'laptop')).toBe(
      'a.tar.sync-conflict-20261107-090503-laptop.gz',
    );
  });

  it('keeps only letters and digits of the device and refuses an empty one', () => {
    expect(conflictName('a.txt', CTX.at, 'My Laptop-1!')).toContain('-MyLaptop1.txt');
    expect(() => conflictName('a.txt', CTX.at, '--')).toThrow(RangeError);
  });

  it('moves to the next second when the name is taken', () => {
    const first = conflictName('a.txt', CTX.at, 'laptop');
    const second = uniqueConflictPath('a.txt', CTX.at, 'laptop', (name) => name === first);
    expect(second).toBe('a.sync-conflict-20261107-090504-laptop.txt');
  });
});

describe('hub application', () => {
  it('creates, edits and deletes with bumping revisions and sequence', () => {
    const { state, results } = run([push('a', null, 'v1'), push('a', 1, 'v2'), tombstone('a', 2)]);
    expect(results).toEqual([
      { kind: 'accept', rev: 1 },
      { kind: 'accept', rev: 2 },
      { kind: 'accept', rev: 3 },
    ]);
    expect(state.entries.get('a')).toEqual(dead(3, 'v2', 3));
  });

  it('keeps the hub version and stores the stale push as a conflict copy', () => {
    const { state, results } = run([
      push('a', null, 'v1'),
      push('a', 1, 'v2'),
      push('a', 1, 'mine'),
    ]);
    const copy = 'a.sync-conflict-20261107-090503-laptop';
    expect(results[2]).toEqual({ kind: 'conflict', hubRev: 2, conflictPath: copy });
    expect(state.entries.get('a')?.content).toBe('v2');
    expect(state.entries.get(copy)?.content).toBe('mine');
  });

  it('restores a deleted file when the edit arrives after the delete', () => {
    const { state, results } = run([
      push('a', null, 'v1'),
      tombstone('a', 1),
      push('a', 1, 'edit'),
    ]);
    expect(results[2]).toEqual({ kind: 'accept', rev: 3 });
    expect(state.entries.get('a')).toEqual(live(3, 'edit', 3));
  });

  it('ignores a delete of a file edited since and reports it without a copy', () => {
    const { state, results } = run([push('a', null, 'v1'), push('a', 1, 'v2'), tombstone('a', 1)]);
    expect(results[2]).toEqual({ kind: 'conflict', hubRev: 2, conflictPath: null });
    expect(state.entries.get('a')?.deleted).toBe(false);
  });

  it('renames atomically and keeps the content', () => {
    const { state, results } = run([push('a', null, 'v1'), move('a', 'b', 1)]);
    expect(results[1]).toEqual({ kind: 'accept', rev: 1 });
    expect(state.entries.get('a')?.deleted).toBe(true);
    expect(state.entries.get('b')).toEqual(live(1, 'v1', 3));
  });

  it('answers a repeated operation id with the stored result and no change', () => {
    const op = push('a', null, 'v1');
    const first = applyOp(EMPTY_HUB, op, CTX);
    const again = applyOp(first.state, op, { ...CTX, at: CTX.at + 5000 });
    expect(again.state).toBe(first.state);
    expect(again.result).toEqual(first.result);
  });

  it('lists only entries after a sequence number', () => {
    const { state } = run([push('a', null, '1'), push('b', null, '2'), push('a', 1, '3')]);
    expect(
      entriesAfter(state, 1)
        .map(([path]) => path)
        .sort(),
    ).toEqual(['a', 'b']);
    expect(entriesAfter(state, 2).map(([path]) => path)).toEqual(['a']);
    expect(entriesAfter(state, 3)).toEqual([]);
  });
});

describe('client planning', () => {
  const base = new Map<string, ClientBase>([
    ['a', { rev: 1, content: 'x' }],
    ['b', { rev: 2, content: 'y' }],
    ['c', { rev: 3, content: 'z' }],
  ]);

  it('plans edits, creations, deletions and a rename', () => {
    const local = new Map([
      ['a', 'x2'],
      ['d', 'new'],
      ['e', 'y'],
    ]);
    const ops = planOps('laptop', base, local, [{ from: 'b', to: 'e' }]);
    expect(ops.map((op) => op.kind)).toEqual(['move', 'push', 'push', 'tombstone']);
    expect(ops[0]).toMatchObject({ kind: 'move', from: 'b', to: 'e', baseRev: 2 });
    expect(ops[3]).toMatchObject({ kind: 'tombstone', path: 'c', baseRev: 3 });
  });

  it('plans nothing when local equals base and ignores a rename of an edited file', () => {
    expect(planOps('laptop', base, new Map([...base].map(([p, v]) => [p, v.content])), [])).toEqual(
      [],
    );
    const edited = new Map([
      ['a', 'x'],
      ['c', 'z'],
      ['e', 'changed'],
    ]);
    const ops = planOps('laptop', base, edited, [{ from: 'b', to: 'e' }]);
    expect(ops.map((op) => op.kind)).toEqual(['push', 'tombstone']);
  });

  it('gives a failed move a create plus a delete that cannot lose the content', () => {
    const failed = move('a', 'b', 1);
    const [create, remove] = fallbackForMove('laptop', failed, 'v1');
    expect(create).toMatchObject({ kind: 'push', path: 'b', baseRev: null, content: 'v1' });
    expect(remove).toMatchObject({ kind: 'tombstone', path: 'a', baseRev: 1 });
  });
});

class Client {
  local = new Map<string, string>();
  base = new Map<string, ClientBase>();
  renames: { from: string; to: string }[] = [];
  lastSeq = 0;

  constructor(readonly id: string) {}

  rename(from: string, to: string): void {
    const content = this.local.get(from);
    if (content === undefined || this.local.has(to)) return;
    this.local.delete(from);
    this.local.set(to, content);
    this.renames.push({ from, to });
  }

  settle(op: SyncOp, result: SyncResult, forced: Set<string>): void {
    if (result.kind === 'conflict') {
      for (const path of op.kind === 'move' ? [op.from, op.to] : [op.path]) forced.add(path);
    } else if (op.kind === 'push') {
      this.base.set(op.path, { rev: result.rev, content: op.content });
    } else if (op.kind === 'tombstone') {
      this.base.delete(op.path);
    } else {
      this.base.delete(op.from);
      this.base.set(op.to, { rev: result.rev, content: this.local.get(op.to) ?? '' });
    }
  }

  take(path: string, entry: HubEntry | undefined): void {
    if (entry === undefined || entry.deleted) {
      this.local.delete(path);
      this.base.delete(path);
      return;
    }
    this.local.set(path, entry.content);
    this.base.set(path, { rev: entry.rev, content: entry.content });
  }

  pull(hub: HubState, forced: ReadonlySet<string>): void {
    for (const [path, entry] of entriesAfter(hub, this.lastSeq)) this.take(path, entry);
    for (const path of forced) this.take(path, hub.entries.get(path));
    this.lastSeq = hub.seq;
    this.renames = [];
  }
}

const PATHS = ['a.txt', 'b.txt', 'dir/c.txt', 'noext'] as const;

function pathOf(index: number): string {
  return PATHS[index % PATHS.length] ?? 'a.txt';
}

class World {
  hub: HubState = EMPTY_HUB;
  clock = Date.UTC(2026, 0, 1);
  counter = 0;
  readonly tokens = new Set<string>();
  readonly superseded = new Set<string>();
  readonly clients = [new Client('alpha'), new Client('beta')];

  client(index: number): Client {
    const found = this.clients[index % this.clients.length];
    if (found === undefined) throw new Error('no client');
    return found;
  }

  edit(client: Client, path: string): void {
    const old = client.local.get(path);
    if (old !== undefined) this.superseded.add(old);
    this.counter += 1;
    const token = `${client.id}#${String(this.counter)}`;
    this.tokens.add(token);
    client.local.set(path, token);
  }

  remove(client: Client, path: string): void {
    const old = client.local.get(path);
    if (old === undefined) return;
    this.superseded.add(old);
    client.local.delete(path);
  }

  deliver(client: Client, op: SyncOp, duplicate: boolean): SyncResult {
    this.clock += 1000;
    const outcome = applyOp(this.hub, op, { device: client.id, at: this.clock });
    this.hub = outcome.state;
    if (duplicate) {
      const again = applyOp(this.hub, op, { device: client.id, at: this.clock + 7000 });
      expect(again.state).toBe(this.hub);
      expect(again.result).toEqual(outcome.result);
    }
    return outcome.result;
  }

  sync(client: Client, dropAt: number | null, duplicate: boolean): boolean {
    const forced = new Set<string>();
    const queue = [...planOps(client.id, client.base, client.local, client.renames)];
    for (let index = 0; queue.length > 0; index += 1) {
      const op = queue.shift();
      if (op === undefined) break;
      const result = this.deliver(client, op, duplicate);
      if (dropAt === index) return false;
      if (op.kind === 'move' && result.kind === 'conflict') {
        queue.unshift(...fallbackForMove(client.id, op, client.local.get(op.to) ?? ''));
      } else {
        client.settle(op, result, forced);
      }
    }
    client.pull(this.hub, forced);
    return true;
  }

  step(action: Action): void {
    const client = this.client(action.c);
    if (action.t === 'edit') this.edit(client, pathOf(action.p));
    else if (action.t === 'rename') client.rename(pathOf(action.p), pathOf(action.q));
    else if (action.t === 'delete') this.remove(client, pathOf(action.p));
    else this.sync(client, action.dropAt, action.duplicate);
  }

  liveHub(): Map<string, string> {
    return new Map(
      [...this.hub.entries]
        .filter(([, entry]) => !entry.deleted)
        .map(([path, e]) => [path, e.content]),
    );
  }

  reconnectAll(): void {
    for (let round = 0; round < 2; round += 1) {
      for (const client of this.clients) expect(this.sync(client, null, false)).toBe(true);
    }
  }
}

type Action =
  | { readonly t: 'edit'; readonly c: number; readonly p: number }
  | { readonly t: 'rename'; readonly c: number; readonly p: number; readonly q: number }
  | { readonly t: 'delete'; readonly c: number; readonly p: number }
  | {
      readonly t: 'sync';
      readonly c: number;
      readonly dropAt: number | null;
      readonly duplicate: boolean;
    };

const actionArb: fc.Arbitrary<Action> = fc.oneof(
  fc.record({ t: fc.constant('edit' as const), c: fc.nat(1), p: fc.nat(3) }),
  fc.record({ t: fc.constant('rename' as const), c: fc.nat(1), p: fc.nat(3), q: fc.nat(3) }),
  fc.record({ t: fc.constant('delete' as const), c: fc.nat(1), p: fc.nat(3) }),
  fc.record({
    t: fc.constant('sync' as const),
    c: fc.nat(1),
    dropAt: fc.option(fc.nat(4), { nil: null }),
    duplicate: fc.boolean(),
  }),
);

describe('two-client convergence', () => {
  it('converges to the hub state and keeps every unsuperseded edit', () => {
    fc.assert(
      fc.property(fc.array(actionArb, { minLength: 1, maxLength: 80 }), (actions) => {
        const world = new World();
        for (const action of actions) world.step(action);
        world.reconnectAll();
        const hub = world.liveHub();
        for (const client of world.clients) {
          expect(client.local).toEqual(hub);
          expect(planOps(client.id, client.base, client.local, [])).toEqual([]);
          for (const [path, known] of client.base) {
            expect(world.hub.entries.get(path)).toMatchObject({ rev: known.rev, deleted: false });
          }
        }
        const present = new Set(hub.values());
        const lost = [...world.tokens].filter((t) => !world.superseded.has(t) && !present.has(t));
        expect(lost).toEqual([]);
      }),
      { numRuns: 500 },
    );
  });

  it('keeps both sides of a concurrent edit as the hub file and a conflict copy', () => {
    const world = new World();
    const [alpha, beta] = world.clients;
    if (alpha === undefined || beta === undefined) throw new Error('clients');
    world.edit(alpha, 'a.txt');
    world.sync(alpha, null, false);
    world.sync(beta, null, false);
    world.edit(alpha, 'a.txt');
    world.edit(beta, 'a.txt');
    world.sync(alpha, null, false);
    world.sync(beta, null, false);
    world.sync(alpha, null, false);
    const names = [...world.liveHub().keys()].sort();
    expect(names).toHaveLength(2);
    expect(names[0]).toMatch(/^a\.sync-conflict-\d{8}-\d{6}-beta\.txt$/);
    expect(alpha.local).toEqual(beta.local);
  });
});
