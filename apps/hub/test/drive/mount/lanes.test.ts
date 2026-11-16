import { randomBytes } from 'node:crypto';
import {
  OPS,
  REQUEST_META,
  decodeFrame,
  encodeMeta,
  type Frame,
  type RequestMetaInput,
  type RequestOpName,
} from '@smarteverything/domain/drive-mount';
import { describe, expect, it } from 'vitest';
import { DriveActivity } from '../../../src/drive/activity';
import { Dispatch } from '../../../src/drive/mount/dispatch';
import { Lanes, laneMismatches, type Resolvers } from '../../../src/drive/mount/lanes';
import type { Executors, RawCall } from '../../../src/drive/mount/operation';
import { MountSession, type MountLink } from '../../../src/drive/mount/session';
import { posix } from '../../../src/drive/posix/errors';
import { testLogger } from '../../support/logs';

const ROOT = 1;
const FILE_A = 10;
const FILE_B = 11;
const COMMIT_A = 100;
const COMMIT_B = 101;

function gate(): { readonly opened: Promise<void>; readonly open: () => void } {
  let open = (): void => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return {
    opened,
    open: (): void => {
      open();
    },
  };
}

function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

interface Rig {
  readonly dispatch: Dispatch;
  readonly session: MountSession;
  readonly link: MountLink;
  readonly log: string[];
  readonly gates: Map<string, ReturnType<typeof gate>>;
  readonly send: <Name extends RequestOpName>(
    name: Name,
    meta: RequestMetaInput<Name>,
    tag: string,
  ) => void;
}

function rigOf(entries: ReadonlyMap<string, number>, commits: ReadonlyMap<number, number>): Rig {
  const log: string[] = [];
  const gates = new Map<string, ReturnType<typeof gate>>();
  const tags = new Map<bigint, string>();
  let nextId = 0n;
  const run =
    (name: RequestOpName) =>
    async (call: RawCall): Promise<Uint8Array> => {
      const tag = tags.get(call.requestId);
      if (tag === undefined) throw new Error(`No tag for ${String(call.requestId)}`);
      log.push(`start ${tag}`);
      const held = gates.get(tag);
      if (held !== undefined) await held.opened;
      log.push(`end ${tag}`);
      return new Uint8Array([OPS[name].code]);
    };
  const executors: Executors = Object.fromEntries(
    (['PUT', 'END', 'BEGIN', 'RENAME', 'CREATE', 'UNLINK', 'LINK'] as const).map((name) => [
      name,
      run(name),
    ]),
  );
  const resolvers: Resolvers = () => ({
    commitInode: (id): number => {
      const inodeId = commits.get(id);
      if (inodeId === undefined) throw posix('ESTALE', `The commit ${String(id)} is unknown.`);
      return inodeId;
    },
    child: (entry): Promise<number | null> => {
      const ino = entries.get(`${String(entry.parent)}/${entry.name}`);
      return Promise.resolve(ino ?? null);
    },
  });
  const dispatch = new Dispatch(executors, testLogger('drive'), resolvers, new DriveActivity());
  const session = new MountSession('node', { profileId: 'owner', nodeId: 'node' });
  const link: MountLink = {
    send: () => undefined,
    close: () => undefined,
  };
  session.bind(link);
  const send = <Name extends RequestOpName>(
    name: Name,
    meta: RequestMetaInput<Name>,
    tag: string,
  ): void => {
    nextId += 1n;
    tags.set(nextId, tag);
    const frame: Frame = {
      type: 'request',
      op: OPS[name].code,
      requestId: nextId,
      more: false,
      meta: encodeMeta(REQUEST_META[name], meta),
      payload: name === 'PUT' || name === 'CREATE' ? new Uint8Array([1]) : null,
    };
    void dispatch.handle(session, link, frame);
  };
  return { dispatch, session, link, log, gates, send };
}

function key(): Uint8Array<ArrayBuffer> {
  return new Uint8Array(randomBytes(16));
}

function put(ino: number): RequestMetaInput<'PUT'> {
  return { ino, baseRev: 0, size: 1, mtimeNs: 1n, fsync: false, opKey: key() };
}

describe('the keyed mutation lanes', () => {
  it('runs writes to two files of one session in parallel', async () => {
    const rig = rigOf(new Map(), new Map());
    rig.gates.set('put a', gate());
    rig.send('PUT', put(FILE_A), 'put a');
    rig.send('PUT', put(FILE_B), 'put b');
    await settle();
    expect(rig.log).toEqual(['start put a', 'start put b', 'end put b']);
    rig.gates.get('put a')?.open();
    await settle();
    expect(rig.log.at(-1)).toBe('end put a');
  });

  it('keeps writes to one file in arrival order', async () => {
    const rig = rigOf(new Map(), new Map());
    rig.gates.set('put 1', gate());
    rig.send('PUT', put(FILE_A), 'put 1');
    rig.send('PUT', put(FILE_A), 'put 2');
    await settle();
    expect(rig.log).toEqual(['start put 1']);
    rig.gates.get('put 1')?.open();
    await settle();
    expect(rig.log).toEqual(['start put 1', 'end put 1', 'start put 2', 'end put 2']);
  });

  it('holds a rename over a file until the commit to that file ends', async () => {
    const rig = rigOf(
      new Map([
        [`${String(ROOT)}/a`, FILE_A],
        [`${String(ROOT)}/b`, FILE_B],
      ]),
      new Map([[COMMIT_A, FILE_A]]),
    );
    rig.gates.set('end a', gate());
    rig.send(
      'END',
      { commit: COMMIT_A, size: 1, length: 1, mtimeNs: 1n, fsync: false, opKey: key() },
      'end a',
    );
    rig.send(
      'RENAME',
      { parent: ROOT, name: 'a', newParent: ROOT, newName: 'b', flags: 0, opKey: key() },
      'rename',
    );
    rig.send(
      'CREATE',
      {
        parent: ROOT,
        name: 'c',
        ino: 77,
        mode: 0o644,
        uid: null,
        gid: null,
        mtimeNs: 1n,
        fsync: false,
        opKey: key(),
      },
      'create',
    );
    rig.send('PUT', put(FILE_B), 'put b');
    await settle();
    expect(rig.log).toEqual(['start end a', 'start put b', 'end put b']);
    rig.gates.get('end a')?.open();
    await settle();
    expect(rig.log).toEqual([
      'start end a',
      'start put b',
      'end put b',
      'end end a',
      'start rename',
      'end rename',
      'start create',
      'end create',
    ]);
  });

  it('holds a rename that replaces a file until the commit to the replaced file ends', async () => {
    const rig = rigOf(
      new Map([
        [`${String(ROOT)}/a`, FILE_A],
        [`${String(ROOT)}/b`, FILE_B],
      ]),
      new Map([[COMMIT_B, FILE_B]]),
    );
    rig.gates.set('end b', gate());
    rig.send(
      'END',
      { commit: COMMIT_B, size: 1, length: 1, mtimeNs: 1n, fsync: false, opKey: key() },
      'end b',
    );
    rig.send(
      'RENAME',
      { parent: ROOT, name: 'a', newParent: ROOT, newName: 'b', flags: 0, opKey: key() },
      'rename',
    );
    await settle();
    expect(rig.log).toEqual(['start end b']);
    rig.gates.get('end b')?.open();
    await settle();
    expect(rig.log).toEqual(['start end b', 'end end b', 'start rename', 'end rename']);
  });

  it('answers an END for an unknown commit at once with the commit error', () => {
    const rig = rigOf(new Map(), new Map());
    const replies: Frame[] = [];
    rig.session.bind({
      send: (bytes) => {
        replies.push(decodeFrame(bytes));
      },
      close: () => undefined,
    });
    const link = rig.session.link;
    if (link === null) throw new Error('The session has no link.');
    void rig.dispatch.handle(rig.session, link, {
      type: 'request',
      op: OPS.END.code,
      requestId: 7n,
      more: false,
      meta: encodeMeta(REQUEST_META.END, {
        commit: COMMIT_A,
        size: 1,
        length: 1,
        mtimeNs: 1n,
        fsync: false,
        opKey: key(),
      }),
      payload: null,
    });
    expect(replies.map((frame) => frame.type)).toEqual(['error']);
    expect(rig.log).toEqual([]);
  });

  it('records the wait and run time of each operation', async () => {
    const rig = rigOf(new Map(), new Map());
    rig.send('PUT', put(FILE_A), 'put a');
    rig.send('PUT', put(FILE_A), 'put a again');
    await settle();
    const recorded = rig.dispatch.latency.snapshot()['PUT'];
    expect(recorded?.run.count).toBe(2);
    expect(recorded?.wait.count).toBe(2);
  });
});

function made(name: string, ino: number, parent = ROOT): RequestMetaInput<'CREATE'> {
  return {
    parent,
    name,
    ino,
    mode: 0o644,
    uid: null,
    gid: null,
    mtimeNs: 1n,
    fsync: false,
    opKey: key(),
  };
}

describe('new and removed names in one folder', () => {
  it('lands creates of different names in one folder together', async () => {
    const rig = rigOf(new Map(), new Map());
    rig.gates.set('create a', gate());
    rig.send('CREATE', made('a', 50), 'create a');
    rig.send('CREATE', made('b', 51), 'create b');
    await settle();
    expect(rig.log).toEqual(['start create a', 'start create b', 'end create b']);
    rig.gates.get('create a')?.open();
    await settle();
    expect(rig.log.at(-1)).toBe('end create a');
  });

  it('keeps a remove and a create of the same name in arrival order', async () => {
    const rig = rigOf(new Map(), new Map());
    rig.gates.set('unlink a', gate());
    rig.send('UNLINK', { parent: ROOT, name: 'a', ino: 50, opKey: key() }, 'unlink a');
    rig.send('CREATE', made('a', 51), 'create a');
    await settle();
    expect(rig.log).toEqual(['start unlink a']);
    rig.gates.get('unlink a')?.open();
    await settle();
    expect(rig.log).toEqual(['start unlink a', 'end unlink a', 'start create a', 'end create a']);
  });

  it('makes a rename in the folder wait for the creates before it and the creates after it wait for the rename', async () => {
    const rig = rigOf(new Map(), new Map());
    rig.gates.set('create a', gate());
    rig.send('CREATE', made('a', 50), 'create a');
    rig.send(
      'RENAME',
      { parent: ROOT, name: 'x', newParent: ROOT, newName: 'y', flags: 0, opKey: key() },
      'rename',
    );
    rig.send('CREATE', made('b', 51), 'create b');
    await settle();
    expect(rig.log).toEqual(['start create a']);
    rig.gates.get('create a')?.open();
    await settle();
    expect(rig.log).toEqual([
      'start create a',
      'end create a',
      'start rename',
      'end rename',
      'start create b',
      'end create b',
    ]);
  });

  it('lands a file inside a folder only after the folder change before it', async () => {
    const rig = rigOf(new Map(), new Map());
    rig.gates.set('link', gate());
    rig.send('LINK', { ino: FILE_A, parent: 60, name: 'l', opKey: key() }, 'link');
    rig.send('CREATE', made('inner', 61, 60), 'create inner');
    await settle();
    expect(rig.log).toEqual(['start link']);
    rig.gates.get('link')?.open();
    await settle();
    expect(rig.log).toEqual(['start link', 'end link', 'start create inner', 'end create inner']);
  });
});

describe('the lanes', () => {
  it('order exactly the ops the protocol marks as mutations', () => {
    expect(laneMismatches()).toEqual([]);
  });

  it('lets a later wait on a resolved key see only earlier arrivals', async () => {
    const lanes = new Lanes();
    const order: string[] = [];
    const first = gate();
    const renamed = lanes.run([ROOT], async (earlier) => {
      await earlier([FILE_A]);
      order.push('rename');
    });
    const later = lanes.run([FILE_A], async () => {
      await first.opened;
      order.push('later');
    });
    await settle();
    expect(order).toEqual(['rename']);
    first.open();
    await Promise.all([renamed, later]);
    expect(order).toEqual(['rename', 'later']);
    expect(lanes.pending).toBe(0);
  });

  it('frees a key after a failed operation', async () => {
    const lanes = new Lanes();
    await expect(lanes.run([FILE_A], () => Promise.reject(new Error('boom')))).rejects.toThrow(
      'boom',
    );
    await lanes.run([FILE_A], () => Promise.resolve());
    expect(lanes.pending).toBe(0);
  });
});
