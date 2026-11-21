import { mkdtemp, readdir, readlink, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAX_FRAME_BYTES, OPS, encodeFrame } from '@smarteverything/domain/drive-mount';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MountDedupe, opKeyText } from '../../../src/drive/mount/dedupe';
import { GroupFsync, syncPath } from '../../../src/drive/mount/fsync';
import { PosixError } from '../../../src/drive/posix/errors';
import { attachTo, opKey, openMountRig, type Attached, type MountRig } from './mount-rig';
import { testLogger } from '../../support/logs';

const WRITTEN_NS = 1_763_100_000_123_456_789n;

describe('the group fsync', () => {
  it('syncs each path and the journal once for requests that arrive together', async () => {
    const synced: string[] = [];
    const group = new GroupFsync(
      () => '/data/hub.db-wal',
      (path) => {
        synced.push(path);
        return Promise.resolve();
      },
    );
    await Promise.all([
      group.request(['/a', '/dir']),
      group.request(['/b', '/dir']),
      group.request(['/a']),
    ]);
    expect(synced.sort()).toEqual(['/a', '/b', '/data/hub.db-wal', '/dir']);
    await group.request(['/c']);
    expect(synced.filter((path) => path === '/data/hub.db-wal')).toHaveLength(2);
  });

  it('makes the journal optional and passes a failure to every waiter', async () => {
    const failing = new GroupFsync(
      () => null,
      () => Promise.reject(new Error('disk')),
    );
    const results = await Promise.allSettled([failing.request(['/a']), failing.request(['/b'])]);
    expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected']);
  });

  it('syncs a real file and skips a path that is gone', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mount-fsync-'));
    try {
      const file = join(directory, 'f');
      await writeFile(file, 'x');
      await syncPath(file);
      await syncPath(directory);
      await syncPath(join(directory, 'missing'));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe('the operation memory', () => {
  const memory = new Map<string, Record<string, unknown>>();
  const dedupe = new MountDedupe(
    {
      recall: (placement, id): Promise<Record<string, unknown> | undefined> =>
        Promise.resolve(memory.get(`${placement}${id}`)),
      rememberAll: (entries): Promise<void> => {
        for (const entry of entries) memory.set(`${entry.placementId}${entry.opId}`, entry.result);
        return Promise.resolve();
      },
    },
    testLogger('drive'),
  );
  const RERUN = (): Promise<null> => Promise.resolve(null);

  it('runs a concurrent resend once and answers both the same', async () => {
    const key = opKey();
    let runs = 0;
    const run = async (): Promise<Record<string, never>> => {
      runs += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return {};
    };
    const [a, b] = await Promise.all([
      dedupe.once('p', { name: 'UNLINK', key }, run, RERUN),
      dedupe.once('p', { name: 'UNLINK', key }, run, RERUN),
    ]);
    expect(runs).toBe(1);
    expect(a).toEqual(b);
    await new Promise((resolve) => setImmediate(resolve));
    expect(memory.has(`p${opKeyText(key)}`)).toBe(true);
  });

  it('does not remember a failure and keeps keys apart per placement', async () => {
    const key = opKey();
    await expect(
      dedupe.once(
        'p',
        { name: 'UNLINK', key },
        () => Promise.reject(new PosixError('EIO', 'x')),
        RERUN,
      ),
    ).rejects.toMatchObject({ code: 'EIO' });
    let runs = 0;
    const run = (): Promise<Record<string, never>> => {
      runs += 1;
      return Promise.resolve({});
    };
    await dedupe.once('p', { name: 'UNLINK', key }, run, RERUN);
    await dedupe.once('q', { name: 'UNLINK', key }, run, RERUN);
    expect(runs).toBe(2);
  });

  it('rebuilds the reply of a claimed operation whose reply was lost, without running it again', async () => {
    const key = opKey();
    memory.set(`p${opKeyText(key)}`, { action: 'UNLINK', reply: null });
    let runs = 0;
    const reply = await dedupe.once(
      'p',
      { name: 'UNLINK', key },
      () => {
        runs += 1;
        return Promise.resolve({});
      },
      () => Promise.resolve({}),
    );
    expect(reply).toEqual({});
    expect(runs).toBe(0);
  });

  it('runs a claimed operation again when its effect is not there', async () => {
    const key = opKey();
    memory.set(`p${opKeyText(key)}`, { action: 'UNLINK', reply: null });
    let runs = 0;
    await dedupe.once(
      'p',
      { name: 'UNLINK', key },
      () => {
        runs += 1;
        return Promise.resolve({});
      },
      RERUN,
    );
    expect(runs).toBe(1);
  });
});

let rig: MountRig;
let mine: Attached;

beforeEach(async () => {
  rig = await openMountRig(80);
  mine = await attachTo(
    rig,
    { nodeId: rig.posix.node, profileId: rig.posix.ownerId },
    rig.posix.mine.id,
  );
});

afterEach(async () => {
  await rig.close();
});

function closeCode(): Promise<number> {
  return new Promise((resolve) => {
    mine.client.socket.once('close', resolve);
  });
}

describe('the wire rules', () => {
  it('has a handler for every request op', () => {
    expect(rig.mount.dispatch.complete()).toEqual([]);
  });

  it('answers a payload on an op that takes none, and a missing payload', async () => {
    await expect(
      mine.client.call('GETATTR', { ino: mine.root }, new Uint8Array([1])),
    ).rejects.toMatchObject({ code: 'EINVAL' });
    await expect(mine.client.call('WRITE', { commit: 1, offset: 0 })).rejects.toMatchObject({
      code: 'EINVAL',
    });
  });

  it('answers a meta that does not fit the op with an error and keeps the socket', async () => {
    const bad = encodeFrame({
      type: 'request',
      op: OPS.GETATTR.code,
      requestId: 777n,
      more: false,
      meta: new Uint8Array([0xff, 0x00]),
      payload: null,
    });
    const answer = new Promise<Buffer>((resolve) => {
      mine.client.socket.once('message', resolve);
    });
    mine.client.socket.send(bad, { binary: true });
    const frame = await answer;
    expect(frame[0]).toBe(3);
    expect((await mine.client.call('GETATTR', { ino: mine.root })).attr.ino).toBe(mine.root);
  });

  it('closes a socket that sends a text frame', async () => {
    const closed = closeCode();
    mine.client.socket.send('hello');
    expect(await closed).toBe(1003);
  });

  it('closes a socket that sends a frame beyond the frame limit', async () => {
    const closed = closeCode();
    mine.client.socket.send(new Uint8Array(MAX_FRAME_BYTES + 1), { binary: true });
    expect(await closed).toBe(1009);
  });

  it('closes a socket that sends bytes that are no frame', async () => {
    const closed = closeCode();
    mine.client.socket.send(new Uint8Array([1, 2, 3]), { binary: true });
    expect(await closed).toBe(1008);
  });

  it('closes a socket that says hello twice', async () => {
    const closed = closeCode();
    mine.client.request('HELLO', { session: null, seqs: [], handles: [], locks: [], commits: [] });
    expect(await closed).toBe(1008);
  });

  it('closes the sockets of a computer whose access was revoked', async () => {
    const closed = closeCode();
    rig.revoke(rig.posix.node);
    expect(await closed).toBe(4001);
  });
});

describe('an END that finds its staging file gone', () => {
  it('treats the commit as applied and answers with the current file', async () => {
    const entry = await mine.client.created(mine.root, 'crash.txt');
    const { commit } = await mine.client.call('BEGIN', {
      ino: entry.ino,
      baseRev: entry.attr.rev,
      opKey: opKey(),
    });
    await rig.mount.services.staging.remove(rig.posix.mine.id, commit);
    const done = await mine.client.call('END', {
      commit,
      size: 0,
      length: 0,
      mtimeNs: WRITTEN_NS,
      fsync: false,
      opKey: opKey(),
    });
    expect(done.rev).toBe(entry.attr.rev);
    expect(rig.posix.opened.store.driveMountCommits.find(commit)?.state).toBe('done');
  });
});

describe('the staging file of a commit written in parallel', () => {
  it('is opened once however many writes arrive before the first open finishes', async () => {
    const entry = await mine.client.created(mine.root, 'parallel.bin');
    const { commit } = await mine.client.call('BEGIN', {
      ino: entry.ino,
      baseRev: entry.attr.rev,
      opKey: opKey(),
    });
    const staging = rig.mount.services.staging;
    const path = await staging.path(rig.posix.mine.id, commit);
    const target = { rootId: rig.posix.mine.id, commitId: commit };
    await Promise.all(
      Array.from({ length: 16 }, (_unused, index) =>
        staging.write(target, index * 4, new Uint8Array([index, index, index, index])),
      ),
    );
    const links = await Promise.allSettled(
      (await readdir('/proc/self/fd')).map((fd) => readlink(`/proc/self/fd/${fd}`)),
    );
    const open = links.filter((link) => link.status === 'fulfilled' && link.value === path);
    expect(open).toHaveLength(1);
    await staging.close(commit);
  });
});
