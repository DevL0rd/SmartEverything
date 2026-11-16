import type { RequestMetaInput } from '@smarteverything/domain/drive-mount';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { attachTo, openMountRig, until, type Attached, type MountRig } from './mount-rig';

let rig: MountRig;
let first: Attached;
let second: Attached;
let ino: number;

const WRITE = 2;
const READ = 1;
const OWNER_A = 11n;
const OWNER_B = 22n;

beforeEach(async () => {
  rig = await openMountRig(120);
  const who = { nodeId: rig.posix.node, profileId: rig.posix.ownerId };
  first = await attachTo(rig, who, rig.posix.mine.id);
  second = await attachTo(rig, who, rig.posix.mine.id);
  const entry = await first.client.created(first.root, 'locked.db');
  ino = entry.ino;
});

afterEach(async () => {
  await rig.close();
});

function lock(
  owner: bigint,
  type: 1 | 2,
  wait: boolean,
  span: readonly [bigint, bigint] = [0n, 99n],
): RequestMetaInput<'SETLK'> {
  return { ino, owner, type, start: span[0], end: span[1], pid: 7, wait, flock: false };
}

describe('locks between two sessions', () => {
  it('refuses a conflicting lock without waiting and reports the holder', async () => {
    await first.client.call('SETLK', lock(OWNER_A, WRITE, false));
    await expect(second.client.call('SETLK', lock(OWNER_B, WRITE, false))).rejects.toMatchObject({
      code: 'EAGAIN',
    });
    const probe = await second.client.call('GETLK', {
      ino,
      owner: OWNER_B,
      type: WRITE,
      start: 10n,
      end: 20n,
      pid: 9,
    });
    expect(probe.lock).toMatchObject({ type: WRITE, start: 0n, end: 99n, pid: 7 });
  });

  it('lets readers share', async () => {
    await first.client.call('SETLK', lock(OWNER_A, READ, false));
    await second.client.call('SETLK', lock(OWNER_B, READ, false));
  });

  it('grants a waiting lock when the holder unlocks', async () => {
    await first.client.call('SETLK', lock(OWNER_A, WRITE, false));
    let granted = false;
    const waiting = second.client.request('SETLK', lock(OWNER_B, WRITE, true));
    waiting.sent.then(
      () => {
        granted = true;
      },
      (cause: unknown) => {
        throw cause;
      },
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(granted).toBe(false);
    await first.client.call('UNLOCK', {
      ino,
      owner: OWNER_A,
      start: 0n,
      end: 0xffff_ffff_ffff_ffffn,
      flock: false,
    });
    await until(() => granted, 'the waiting lock to be granted');
  });

  it('cancels a waiting lock and answers it as interrupted', async () => {
    await first.client.call('SETLK', lock(OWNER_A, WRITE, false));
    const waiting = second.client.request('SETLK', lock(OWNER_B, WRITE, true));
    const outcome = waiting.sent.catch((cause: unknown) => cause);
    await new Promise((resolve) => setTimeout(resolve, 30));
    await second.client.call('CANCEL', { requestId: waiting.id });
    expect(await outcome).toMatchObject({ code: 'EINTR' });
  });

  it('refuses a lock that would deadlock', async () => {
    await first.client.call('SETLK', lock(OWNER_A, WRITE, false, [0n, 0n]));
    await second.client.call('SETLK', lock(OWNER_B, WRITE, false, [5n, 5n]));
    const waiting = first.client.request('SETLK', lock(OWNER_A, WRITE, true, [5n, 5n]));
    const outcome = waiting.sent.catch((cause: unknown) => cause);
    await new Promise((resolve) => setTimeout(resolve, 30));
    await expect(
      second.client.call('SETLK', lock(OWNER_B, WRITE, true, [0n, 0n])),
    ).rejects.toMatchObject({ code: 'EDEADLK' });
    await first.client.call('CANCEL', { requestId: waiting.id });
    expect(await outcome).toMatchObject({ code: 'EINTR' });
  });

  it('joins a resent waiting request instead of queueing it twice', async () => {
    await first.client.call('SETLK', lock(OWNER_A, WRITE, false));
    const one = second.client.request('SETLK', lock(OWNER_B, WRITE, true));
    const two = second.client.request('SETLK', lock(OWNER_B, WRITE, true));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(rig.mount.services.locks.table.waiters(ino)).toHaveLength(1);
    await first.client.call('UNLOCK', {
      ino,
      owner: OWNER_A,
      start: 0n,
      end: 0xffff_ffff_ffff_ffffn,
      flock: false,
    });
    await Promise.all([one.sent, two.sent]);
  });
});

describe('locks and the lease', () => {
  it('keeps the locks of a dropped session inside the lease and frees them after it', async () => {
    await first.client.call('SETLK', lock(OWNER_A, WRITE, false));
    first.client.close();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await expect(second.client.call('SETLK', lock(OWNER_B, WRITE, false))).rejects.toMatchObject({
      code: 'EAGAIN',
    });
    await new Promise((resolve) => setTimeout(resolve, 250));
    await second.client.call('SETLK', lock(OWNER_B, WRITE, false));
  });

  it('wakes a waiter when the holder’s lease runs out', async () => {
    await first.client.call('SETLK', lock(OWNER_A, WRITE, false));
    const waiting = second.client.request('SETLK', lock(OWNER_B, WRITE, true));
    first.client.close();
    await waiting.sent;
  });

  it('reclaims a lock nobody took after the lease and reports a taken one as lost', async () => {
    await first.client.call('SETLK', lock(OWNER_A, WRITE, false, [0n, 9n]));
    await first.client.call('SETLK', lock(OWNER_A, WRITE, false, [50n, 59n]));
    const previous = first.client.session;
    first.client.close();
    await new Promise((resolve) => setTimeout(resolve, 250));
    await second.client.call('SETLK', lock(OWNER_B, WRITE, false, [50n, 59n]));
    const returning = await rig.connect(rig.posix.node);
    const reply = await returning.hello({
      session: previous,
      locks: [
        { ino, owner: OWNER_A, type: WRITE, start: 0n, end: 9n, pid: 7, flock: false },
        { ino, owner: OWNER_A, type: WRITE, start: 50n, end: 59n, pid: 7, flock: false },
      ],
    });
    expect(reply.resumed).toBe(false);
    await until(() => returning.pushed('LOCK_LOST').length === 1, 'the lost lock push');
    expect(returning.pushed('LOCK_LOST')[0]).toEqual({ ino, owner: OWNER_A });
    expect(
      rig.mount.services.locks.table
        .holders(ino)
        .map((held) => held.start)
        .sort(),
    ).toEqual([0n, 50n]);
  });

  it('reclaims a whole-file lock as the kind it was taken as and unlocks one range of it', async () => {
    const flockRequest = {
      ...lock(OWNER_A, WRITE, false, [0n, 0xffff_ffff_ffff_ffffn]),
      flock: true,
    };
    await first.client.call('SETLK', flockRequest);
    await first.client.call('SETLK', lock(OWNER_A, WRITE, false, [0n, 99n]));
    await first.client.call('UNLOCK', {
      ino,
      owner: OWNER_A,
      start: 10n,
      end: 19n,
      flock: false,
    });
    const held = rig.mount.services.locks.table.holders(ino);
    expect(held.map((entry) => [entry.flock, entry.start, entry.end])).toEqual(
      expect.arrayContaining([
        [false, 0n, 9n],
        [false, 20n, 99n],
        [true, 0n, 0xffff_ffff_ffff_ffffn],
      ]),
    );
    expect(held).toHaveLength(3);
    const previous = first.client.session;
    first.client.close();
    await new Promise((resolve) => setTimeout(resolve, 250));
    const returning = await rig.connect(rig.posix.node);
    await returning.hello({
      session: previous,
      locks: [{ ino, owner: OWNER_A, type: WRITE, start: 0n, end: 99n, pid: 7, flock: true }],
    });
    expect(
      rig.mount.services.locks.table.holders(ino).map((entry) => [entry.flock, entry.start]),
    ).toEqual([[true, 0n]]);
  });
});
