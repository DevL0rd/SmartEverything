import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { updateDriveSettings } from '../../../src/drive/settings';
import { HashPool } from '../../../src/drive/mount/workers';
import { save } from '../posix/posix-rig';
import { attachTo, opKey, openMountRig, type Attached, type MountRig } from './mount-rig';

let rig: MountRig;
let writer: Attached;

beforeEach(async () => {
  rig = await openMountRig(120, true);
  writer = await attachTo(
    rig,
    { nodeId: rig.posix.node, profileId: rig.posix.ownerId },
    rig.posix.shared.id,
  );
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rig.close();
});

async function outOfOrderWrite(name: string): Promise<void> {
  const entry = await writer.client.created(writer.root, name);
  const { commit } = await writer.client.call('BEGIN', {
    ino: entry.ino,
    baseRev: entry.attr.rev,
    opKey: opKey(),
  });
  await writer.client.call('WRITE', { commit, offset: 4 }, new TextEncoder().encode('two'));
  await writer.client.call('WRITE', { commit, offset: 0 }, new TextEncoder().encode('one '));
  await writer.client.call('END', {
    commit,
    size: 7,
    length: 7,
    mtimeNs: 1_763_100_000_123_456_789n,
    fsync: false,
    opKey: opKey(),
  });
}

describe('the mount follows the drive settings', () => {
  it('stops serving cached listings when the listing cache is turned off', async () => {
    await save(rig.posix, rig.posix.shared, 'a.txt', 'a');
    const read = vi.spyOn(rig.mount.services.posix, 'readdir');
    await writer.client.call('READDIR', { ino: writer.root, cursor: 0 });
    await writer.client.call('READDIR', { ino: writer.root, cursor: 0 });
    expect(read).toHaveBeenCalledTimes(1);
    await updateDriveSettings(rig.posix.opened.store, { listingCacheSeconds: 0 });
    await writer.client.call('READDIR', { ino: writer.root, cursor: 0 });
    await writer.client.call('READDIR', { ino: writer.root, cursor: 0 });
    expect(read).toHaveBeenCalledTimes(3);
  });

  it('resizes the running hash pool to the saved worker count', async () => {
    const resize = vi.spyOn(HashPool.prototype, 'resize');
    await outOfOrderWrite('first.txt');
    await updateDriveSettings(rig.posix.opened.store, { cpuWorkers: 3 });
    expect(resize).toHaveBeenCalledWith(3);
  });

  it('applies a worker count saved before the pool exists when it starts', async () => {
    const resize = vi.spyOn(HashPool.prototype, 'resize');
    await updateDriveSettings(rig.posix.opened.store, { cpuWorkers: 2 });
    expect(resize).not.toHaveBeenCalled();
    await outOfOrderWrite('second.txt');
    await updateDriveSettings(rig.posix.opened.store, { cpuWorkers: 5 });
    expect(resize).toHaveBeenCalledWith(5);
  });

  it('stops following after the mount stops', async () => {
    const apply = vi.spyOn(rig.mount.services, 'applySettings');
    rig.mount.stop();
    await updateDriveSettings(rig.posix.opened.store, { cpuWorkers: 4 });
    expect(apply).not.toHaveBeenCalled();
  });
});
