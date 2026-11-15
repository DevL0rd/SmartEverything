import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fsSpace, fsStatfs, nodeInodeProbe } from '../../src/drive/fs-space';
import { DISK_FREE, openPosixRig, save, type PosixRig } from './posix/posix-rig';
import { mkdir } from './posix/posix-rig';

let rig: PosixRig;

beforeEach(async () => {
  rig = await openPosixRig(true);
});

afterEach(async () => {
  await rig.close();
});

function owner(): { profileId: string } {
  return { profileId: rig.ownerId };
}

describe('mounted drive space', () => {
  it('reports the person’s own drive against what is left of their quota', async () => {
    await save(rig, rig.mine, 'notes.txt', 'twelve bytes');
    const used = rig.opened.store.driveQuotas.status(rig.ownerId).usage.live;
    rig.opened.store.driveQuotas.set(rig.ownerId, used + 1000);
    const space = await fsSpace(rig.env.space, owner(), rig.mine.id, undefined);
    expect(space.freeBytes).toBe(1000);
    expect(space.usedBytes).toBe(rig.opened.store.driveRoots.byId(rig.mine.id).bytes);
    expect(space.totalBytes).toBe(space.usedBytes + 1000);
  });

  it('reports the data folder disk free space when no quota is set', async () => {
    const space = await fsSpace(rig.env.space, owner(), rig.mine.id, undefined);
    expect(space.freeBytes).toBe(DISK_FREE);
  });

  it('counts the Shared Drive against no one’s quota', async () => {
    rig.opened.store.driveQuotas.set(rig.ownerId, 1);
    const space = await fsSpace(rig.env.space, owner(), rig.shared.id, undefined);
    expect(space.freeBytes).toBe(DISK_FREE);
  });

  it('gives a person with a grant the folder size and never the sharer’s quota', async () => {
    const folder = await rig.posix.mkdir(rig.scope, mkdir('Projects', rig.rootIno));
    const item = rig.opened.store.driveItems.byPath(rig.mine.id, 'Projects', null);
    if (item === undefined) throw new Error('Projects is missing');
    rig.opened.store.driveQuotas.set(rig.ownerId, 5);
    rig.opened.store.driveGrants.set(
      { itemId: item.id, profileId: rig.memberId, role: 'view', expiresAt: null },
      rig.ownerId,
    );
    const space = await fsSpace(rig.env.space, { profileId: rig.memberId }, rig.mine.id, item.id);
    expect(space).toEqual({
      totalBytes: item.bytes + DISK_FREE,
      usedBytes: item.bytes,
      freeBytes: DISK_FREE,
    });
    expect(folder.attr.type).toBe(2);
  });

  it('refuses another person’s drive that was not shared', async () => {
    await expect(fsSpace(rig.env.space, owner(), rig.theirs.id, undefined)).rejects.toThrow();
  });
});

describe('mounted drive inode counts', () => {
  it('adds the inode counts of the disk to the space', async () => {
    const statfs = await fsStatfs(rig.env.space, owner(), rig.mine.id, undefined);
    expect(statfs).toMatchObject({ files: 1000, freeFiles: 900, freeBytes: DISK_FREE });
  });

  it('reads the real inode counts of a folder on the disk', async () => {
    const counts = await nodeInodeProbe(rig.mine.path);
    expect(counts.files).toBeGreaterThanOrEqual(0);
    expect(counts.free).toBeGreaterThanOrEqual(0);
  });
});
