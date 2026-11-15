import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TMP_DIRECTORY } from '../../../src/drive/intents';
import { save } from '../posix/posix-rig';
import {
  MountFailure,
  attachTo,
  openMountRig,
  opKey,
  type Attached,
  type MountRig,
} from './mount-rig';

const WRITTEN_NS = 1_763_100_000_123_456_789n;

let rig: MountRig;
let mine: Attached;

beforeEach(async () => {
  rig = await openMountRig(90_000, true);
  mine = await attachTo(
    rig,
    { nodeId: rig.posix.node, profileId: rig.posix.ownerId },
    rig.posix.mine.id,
  );
});

afterEach(async () => {
  await rig.close();
});

const text = (value: string): Uint8Array => new TextEncoder().encode(value);

async function created(name: string): Promise<{ ino: number; rev: number }> {
  const entry = await mine.client.call('CREATE', {
    parent: mine.root,
    name,
    mode: 0o644,
    uid: null,
    gid: null,
    exclusive: true,
    opKey: opKey(),
  });
  return { ino: entry.ino, rev: entry.attr.rev };
}

async function revOf(ino: number): Promise<number> {
  return (await mine.client.call('GETATTR', { ino })).attr.rev;
}

async function onDisk(name: string): Promise<string> {
  return readFile(join(rig.posix.mine.path, name), 'utf8');
}

async function put(name: string, content: string): Promise<number> {
  const { ino } = await created(name);
  const reply = await mine.client.call(
    'PUT',
    {
      ino,
      baseRev: await revOf(ino),
      size: content.length,
      mtimeNs: WRITTEN_NS,
      fsync: false,
      opKey: opKey(),
    },
    text(content),
  );
  expect(reply.rev).toBeGreaterThan(0);
  return ino;
}

async function begin(ino: number, baseRev?: number): Promise<number> {
  const reply = await mine.client.call('BEGIN', {
    ino,
    baseRev: baseRev ?? (await revOf(ino)),
    opKey: opKey(),
  });
  return reply.commit;
}

describe('a commit built of ranges', () => {
  it('replaces the whole file when the ranges cover it', async () => {
    const { ino } = await created('whole.txt');
    const commit = await begin(ino);
    await mine.client.call('WRITE', { commit, offset: 0 }, text('hello '));
    await mine.client.call('WRITE', { commit, offset: 6 }, text('world'));
    const done = await mine.client.call('END', {
      commit,
      size: 11,
      mtimeNs: WRITTEN_NS,
      fsync: false,
      opKey: opKey(),
    });
    expect(done.attr.size).toBe(11);
    expect(done.rev).toBe(done.attr.rev);
    expect(await onDisk('whole.txt')).toBe('hello world');
    expect(done.attr.mtimeNs).toBe(WRITTEN_NS);
    expect(done.attr.ctimeNs).toBe(WRITTEN_NS);
  });

  it('patches only the written range into a larger file and keeps the version', async () => {
    const ino = await put('patch.txt', '0123456789');
    const commit = await begin(ino);
    await mine.client.call('WRITE', { commit, offset: 3 }, text('abc'));
    const done = await mine.client.call('END', {
      commit,
      size: 10,
      mtimeNs: WRITTEN_NS,
      fsync: true,
      opKey: opKey(),
    });
    expect(done.attr.size).toBe(10);
    expect(await onDisk('patch.txt')).toBe('012abc6789');
    const versions = rig.posix.opened.store.driveVersions.forItem(
      rig.posix.opened.store.driveItems.byPath(rig.posix.mine.id, 'patch.txt', null)?.id ?? '',
      null,
      10,
    );
    expect(versions.versions.some((version) => version.bytes === 10)).toBe(true);
  });

  it('truncates and extends through the end size', async () => {
    const ino = await put('size.txt', '0123456789');
    const shrink = await begin(ino);
    await mine.client.call('WRITE', { commit: shrink, offset: 0 }, text('ab'));
    await mine.client.call('END', {
      commit: shrink,
      size: 4,
      mtimeNs: WRITTEN_NS,
      fsync: false,
      opKey: opKey(),
    });
    expect(await onDisk('size.txt')).toBe('ab23');
    const grow = await begin(ino);
    await mine.client.call('WRITE', { commit: grow, offset: 0 }, text('z'));
    await mine.client.call('END', {
      commit: grow,
      size: 6,
      mtimeNs: WRITTEN_NS,
      fsync: false,
      opKey: opKey(),
    });
    expect(Buffer.from(await readFile(join(rig.posix.mine.path, 'size.txt')))).toEqual(
      Buffer.from('zb23\0\0'),
    );
  });

  it('keeps hard links one inode after a patch', async () => {
    const ino = await put('one.txt', 'aaaa');
    await mine.client.call('LINK', { ino, parent: mine.root, name: 'two.txt', opKey: opKey() });
    const commit = await begin(ino);
    await mine.client.call('WRITE', { commit, offset: 0 }, text('bbbb'));
    await mine.client.call('END', {
      commit,
      size: 4,
      mtimeNs: WRITTEN_NS,
      fsync: false,
      opKey: opKey(),
    });
    const [a, b] = await Promise.all([
      stat(join(rig.posix.mine.path, 'one.txt')),
      stat(join(rig.posix.mine.path, 'two.txt')),
    ]);
    expect(a.ino).toBe(b.ino);
    expect(await onDisk('two.txt')).toBe('bbbb');
  });

  it('applies an END whose reply was lost once and answers it again', async () => {
    const ino = await put('lost.txt', 'x');
    const commit = await begin(ino);
    await mine.client.call('WRITE', { commit, offset: 0 }, text('yy'));
    const key = opKey();
    const first = await mine.client.call('END', {
      commit,
      size: 2,
      mtimeNs: WRITTEN_NS,
      fsync: false,
      opKey: key,
    });
    const second = await mine.client.call('END', {
      commit,
      size: 2,
      mtimeNs: WRITTEN_NS,
      fsync: false,
      opKey: key,
    });
    expect(second.rev).toBe(first.rev);
    const another = await mine.client.call('END', {
      commit,
      size: 2,
      mtimeNs: WRITTEN_NS,
      fsync: false,
      opKey: opKey(),
    });
    expect(another.rev).toBe(first.rev);
    const item = rig.posix.opened.store.driveItems.byPath(rig.posix.mine.id, 'lost.txt', null);
    expect(item?.rev).toBe(first.rev);
    expect(await onDisk('lost.txt')).toBe('yy');
  });

  it('removes the staging file when the commit lands', async () => {
    const { ino } = await created('tidy.txt');
    const commit = await begin(ino);
    await mine.client.call('WRITE', { commit, offset: 0 }, text('t'));
    await mine.client.call('END', {
      commit,
      size: 1,
      mtimeNs: WRITTEN_NS,
      fsync: false,
      opKey: opKey(),
    });
    const staged = await readdir(join(rig.posix.mine.path, '.se', 'tmp')).catch(() => []);
    expect(staged.filter((name) => name.startsWith('commit-'))).toEqual([]);
  });
});

describe('resuming a commit', () => {
  it('lists the received ranges as start and length and takes only the missing ones', async () => {
    const { ino } = await created('resume.txt');
    const commit = await begin(ino);
    await mine.client.call('WRITE', { commit, offset: 0 }, text('abc'));
    await mine.client.call('WRITE', { commit, offset: 6 }, text('ghi'));
    const again = await mine.client.call('BEGIN', {
      ino,
      baseRev: await revOf(ino),
      opKey: opKey(),
    });
    expect(again.commit).not.toBe(commit);
    const state = await mine.client.call('STATE', { commit });
    expect(state.ranges).toEqual([
      [0, 3],
      [6, 3],
    ]);
    await mine.client.call('WRITE', { commit, offset: 3 }, text('def'));
    await mine.client.call('END', {
      commit,
      size: 9,
      mtimeNs: WRITTEN_NS,
      fsync: false,
      opKey: opKey(),
    });
    expect(await onDisk('resume.txt')).toBe('abcdefghi');
  });

  it('answers BEGIN with the same key by the same commit and its ranges', async () => {
    const { ino } = await created('same.txt');
    const key = opKey();
    const baseRev = await revOf(ino);
    const first = await mine.client.call('BEGIN', { ino, baseRev, opKey: key });
    await mine.client.call('WRITE', { commit: first.commit, offset: 0 }, text('ab'));
    const second = await mine.client.call('BEGIN', { ino, baseRev, opKey: key });
    expect(second.commit).toBe(first.commit);
    expect(second.ranges).toEqual([[0, 2]]);
  });

  it('keeps the commit across a reconnect inside the lease', async () => {
    const { ino } = await created('across.txt');
    const commit = await begin(ino);
    await mine.client.call('WRITE', { commit, offset: 0 }, text('ab'));
    const session = mine.client.session;
    mine.client.close();
    const next = await rig.connect(rig.posix.node);
    const reply = await next.hello({ session });
    expect(reply.resumed).toBe(true);
    await next.call('WRITE', { commit, offset: 2 }, text('cd'));
    await next.call('END', { commit, size: 4, mtimeNs: WRITTEN_NS, fsync: false, opKey: opKey() });
    expect(await onDisk('across.txt')).toBe('abcd');
  });

  it('reports an unknown commit as no ranges', async () => {
    expect((await mine.client.call('STATE', { commit: 987_654 })).ranges).toBeNull();
  });

  it('refuses the commit of another computer', async () => {
    const { ino } = await created('own.txt');
    const commit = await begin(ino);
    const other = await attachTo(
      rig,
      { nodeId: rig.posix.memberNode, profileId: rig.posix.memberId },
      rig.posix.theirs.id,
    );
    await expect(other.client.call('STATE', { commit })).resolves.toEqual({ ranges: null });
    await expect(
      other.client.call('WRITE', { commit, offset: 0 }, text('x')),
    ).rejects.toMatchObject({ code: 'ESTALE' });
  });
});

describe('conflicts and small files', () => {
  it('answers a stale base with the Hub revision', async () => {
    const ino = await put('base.txt', 'v1');
    const commit = await begin(ino);
    await mine.client.call('WRITE', { commit, offset: 0 }, text('mine'));
    await save(rig.posix, rig.posix.mine, 'base.txt', 'theirs');
    const failure = await mine.client
      .call('END', { commit, size: 4, mtimeNs: WRITTEN_NS, fsync: false, opKey: opKey() })
      .catch((cause: unknown) => cause);
    expect(failure).toBeInstanceOf(MountFailure);
    expect(failure).toMatchObject({ code: 'ESTALE' });
    const item = rig.posix.opened.store.driveItems.byPath(rig.posix.mine.id, 'base.txt', null);
    expect(failure).toMatchObject({ rev: item?.rev });
    expect(await onDisk('base.txt')).toBe('theirs');
  });

  it('does not count this computer’s own metadata changes as a conflict', async () => {
    const ino = await put('meta.txt', 'v1');
    const commit = await begin(ino);
    await mine.client.call('WRITE', { commit, offset: 0 }, text('v2'));
    await mine.client.call('SETATTR', { ino, valid: 1, mode: 0o600, opKey: opKey() });
    await mine.client.call('END', {
      commit,
      size: 2,
      mtimeNs: WRITTEN_NS,
      fsync: false,
      opKey: opKey(),
    });
    expect(await onDisk('meta.txt')).toBe('v2');
  });

  it('puts a small file in one request and answers a resend again', async () => {
    const { ino } = await created('small.txt');
    const baseRev = await revOf(ino);
    const key = opKey();
    const meta = { ino, baseRev, size: 5, mtimeNs: WRITTEN_NS, fsync: true, opKey: key };
    const first = await mine.client.call('PUT', meta, text('hello'));
    const again = await mine.client.call('PUT', meta, text('hello'));
    expect(again.rev).toBe(first.rev);
    expect(await onDisk('small.txt')).toBe('hello');
    expect(first.attr.mtimeNs).toBe(WRITTEN_NS);
    expect(first.attr.ctimeNs).toBe(WRITTEN_NS);
  });

  it('puts an empty file', async () => {
    const ino = await put('empty.txt', 'x');
    await mine.client.call(
      'PUT',
      {
        ino,
        baseRev: await revOf(ino),
        size: 0,
        mtimeNs: WRITTEN_NS,
        fsync: false,
        opKey: opKey(),
      },
      new Uint8Array(),
    );
    expect(await onDisk('empty.txt')).toBe('');
  });

  it('refuses a put over a change made elsewhere', async () => {
    const ino = await put('late.txt', 'v1');
    const baseRev = await revOf(ino);
    await save(rig.posix, rig.posix.mine, 'late.txt', 'other');
    await expect(
      mine.client.call(
        'PUT',
        { ino, baseRev, size: 3, mtimeNs: WRITTEN_NS, fsync: false, opKey: opKey() },
        text('new'),
      ),
    ).rejects.toMatchObject({ code: 'ESTALE' });
  });
});

describe('abort, forget, allocate and copy', () => {
  it('drops an aborted commit and refuses more writes to it', async () => {
    const { ino } = await created('abort.txt');
    const commit = await begin(ino);
    await mine.client.call('WRITE', { commit, offset: 0 }, text('zz'));
    await mine.client.call('ABORT', { commit });
    await expect(mine.client.call('WRITE', { commit, offset: 0 }, text('q'))).rejects.toMatchObject(
      { code: 'ESTALE' },
    );
    expect((await mine.client.call('STATE', { commit })).ranges).toBeNull();
    expect(await onDisk('abort.txt')).toBe('');
  });

  it('forgets a finished commit when the journal lets it go', async () => {
    const { ino } = await created('forget.txt');
    const commit = await begin(ino);
    await mine.client.call('WRITE', { commit, offset: 0 }, text('f'));
    await mine.client.call('END', {
      commit,
      size: 1,
      mtimeNs: WRITTEN_NS,
      fsync: false,
      opKey: opKey(),
    });
    const { driveMountCommits } = rig.posix.opened.store;
    expect(driveMountCommits.find(commit)?.state).toBe('done');
    await mine.client.call('FORGET', { commits: [commit] });
    expect(driveMountCommits.find(commit)).toBeUndefined();
  });

  it('zeroes a range inside a patch and extends with zeros', async () => {
    const ino = await put('zero.txt', 'abcdefgh');
    const commit = await begin(ino);
    await mine.client.call('ALLOCATE', { commit, mode: 3, offset: 2, length: 3 });
    await mine.client.call('END', {
      commit,
      size: 10,
      mtimeNs: WRITTEN_NS,
      fsync: false,
      opKey: opKey(),
    });
    expect(Buffer.from(await readFile(join(rig.posix.mine.path, 'zero.txt')))).toEqual(
      Buffer.from('ab\0\0\0fgh\0\0'),
    );
  });

  it('copies bytes from an open file into a commit on the Hub', async () => {
    const source = await put('from.txt', 'SOURCE-DATA');
    const target = await put('to.txt', '..........');
    const { handle } = await mine.client.call('OPEN', { ino: source });
    const commit = await begin(target);
    const copied = await mine.client.call('COPY', {
      srcHandle: handle,
      srcOffset: 7,
      commit,
      dstOffset: 1,
      length: 4,
    });
    expect(copied.copied).toBe(4);
    await mine.client.call('END', {
      commit,
      size: 10,
      mtimeNs: WRITTEN_NS,
      fsync: false,
      opKey: opKey(),
    });
    expect(await onDisk('to.txt')).toBe('.DATA.....');
    await mine.client.call('RELEASE', { handle });
  });
});

describe('abandoned commits', () => {
  async function staged(): Promise<string[]> {
    return (await readdir(join(rig.posix.mine.path, TMP_DIRECTORY))).filter((name) =>
      name.startsWith('commit-'),
    );
  }

  it('aborts the open commits a reconnecting helper no longer lists and keeps the ones it lists', async () => {
    const kept = await begin((await created('kept.txt')).ino);
    const lost = await begin((await created('lost.txt')).ino);
    await mine.client.call('WRITE', { commit: kept, offset: 0 }, text('k'));
    await mine.client.call('WRITE', { commit: lost, offset: 0 }, text('l'));
    expect(await staged()).toHaveLength(2);
    const again = await rig.connect(rig.posix.node);
    await again.hello({ commits: [kept] });
    await again.call('ATTACH', { placementId: mine.placementId });
    const { driveMountCommits } = rig.posix.opened.store;
    expect(driveMountCommits.find(kept)?.state).toBe('open');
    expect(driveMountCommits.find(lost)?.state).toBe('aborted');
    expect(await staged()).toEqual([`commit-${String(kept)}`]);
    expect((await again.call('STATE', { commit: kept })).ranges).not.toBeNull();
  });
});

describe('landing in the drive lane', () => {
  function heldLane(): { release: () => Promise<void> } {
    let open: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const held = rig.mount.services.posix.lane(mine.rootId, () => gate);
    return {
      release: async (): Promise<void> => {
        open();
        await held;
      },
    };
  }

  it('waits for earlier namespace changes before a PUT lands', async () => {
    const { ino } = await created('lane-put.txt');
    const baseRev = await revOf(ino);
    const lane = heldLane();
    const pending = mine.client.call(
      'PUT',
      { ino, baseRev, size: 3, mtimeNs: WRITTEN_NS, fsync: false, opKey: opKey() },
      text('put'),
    );
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(await onDisk('lane-put.txt')).toBe('');
    await lane.release();
    await pending;
    expect(await onDisk('lane-put.txt')).toBe('put');
  });

  it('waits for earlier namespace changes before an END lands', async () => {
    const { ino } = await created('lane-end.txt');
    const commit = await begin(ino);
    await mine.client.call('WRITE', { commit, offset: 0 }, text('end'));
    const lane = heldLane();
    const pending = mine.client.call('END', {
      commit,
      size: 3,
      mtimeNs: WRITTEN_NS,
      fsync: false,
      opKey: opKey(),
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(await onDisk('lane-end.txt')).toBe('');
    await lane.release();
    await pending;
    expect(await onDisk('lane-end.txt')).toBe('end');
  });
});
