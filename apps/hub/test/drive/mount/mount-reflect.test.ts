import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DriveWatchers, systemWatch } from '../../../src/drive/watcher';
import { outsideOf } from '../../../src/drive/watch-reflect';
import { testLogger } from '../../support/logs';
import { attachTo, openMountRig, opKey, type Attached, type MountRig } from './mount-rig';
import { hostScanPort } from '../../../src/drive/scan-port';

const WRITTEN_NS = 1_763_100_000_123_456_789n;
const SETTLE_MS = 40;

let rig: MountRig;
let mine: Attached;
let watchers: DriveWatchers;
let requests: string[];
let waiter: (() => void) | undefined;

function asked(request: string): void {
  requests.push(request);
  waiter?.();
}

function nextRequest(): Promise<string> {
  const seen = requests.length;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('the watcher asked for nothing'));
    }, 5000);
    const check = (): void => {
      const request = requests[seen];
      if (request === undefined) return;
      clearTimeout(timer);
      waiter = undefined;
      resolve(request);
    };
    waiter = check;
    check();
  });
}

beforeEach(async () => {
  rig = await openMountRig(90_000, true);
  mine = await attachTo(
    rig,
    { nodeId: rig.posix.node, profileId: rig.posix.ownerId },
    rig.posix.mine.id,
  );
  requests = [];
  const { store } = rig.posix.opened;
  watchers = new DriveWatchers({
    roots: hostScanPort(store),
    index: reader(),
    activity: rig.activity,
    mounted: (): Promise<boolean> => Promise.resolve(true),
    onPlacementChange: (): (() => void) => (): undefined => undefined,
    enqueueScan: (): void => {
      asked('scan');
    },
    enqueueReflect: (): void => {
      asked('reflect');
    },
    enqueueFollowUps: (): void => {
      asked('follow-ups');
    },
    watch: systemWatch,
    settleMs: SETTLE_MS,
    log: testLogger(),
  });
  await watchers.start(rig.posix.mine);
  requests.splice(0);
});

afterEach(async () => {
  watchers.close();
  await rig.close();
});

const reader =
  (): Parameters<typeof outsideOf>[0] =>
  (rootId, relPaths): ReturnType<Parameters<typeof outsideOf>[0]> =>
    rig.posix.opened.store.host.read('driveScanIndexed', { rootId, relPaths });

async function created(name: string): Promise<{ ino: number; rev: number }> {
  const entry = await mine.client.created(mine.root, name);
  return { ino: entry.ino, rev: entry.attr.rev };
}

describe('a file written through the mount', () => {
  it('leaves the index matching the disk after a PUT, so the watcher asks for no scan', async () => {
    const { ino, rev } = await created('put.bin');
    await mine.client.call(
      'PUT',
      {
        ino,
        baseRev: rev,
        size: 4,
        mtimeNs: WRITTEN_NS,
        fsync: false,
        opKey: opKey(),
      },
      new Uint8Array([1, 2, 3, 4]),
    );
    expect(await outsideOf(reader(), rig.posix.mine, ['put.bin'])).toEqual([]);
    await expect(nextRequest()).resolves.toBe('follow-ups');
    expect(requests).not.toContain('scan');
  });

  it('leaves the index matching the disk after a commit ends, so the watcher asks for no scan', async () => {
    const { ino, rev } = await created('end.txt');
    const { commit } = await mine.client.call('BEGIN', {
      ino,
      baseRev: rev,
      opKey: opKey(),
    });
    await mine.client.call('WRITE', { commit, offset: 0 }, new TextEncoder().encode('hello'));
    await mine.client.call('END', {
      commit,
      size: 5,
      length: 5,
      mtimeNs: WRITTEN_NS,
      fsync: false,
      opKey: opKey(),
    });
    expect(await outsideOf(reader(), rig.posix.mine, ['end.txt'])).toEqual([]);
    await expect(nextRequest()).resolves.toBe('follow-ups');
    expect(requests).not.toContain('scan');
  });
});
