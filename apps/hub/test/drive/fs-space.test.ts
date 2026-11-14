import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fsSpace } from '../../src/drive/fs-space';
import { DISK_FREE, openFsRig, spaceEnvOf, type FsRig } from './fs-rig';

let rig: FsRig;

beforeEach(async () => {
  rig = await openFsRig();
});

afterEach(async () => {
  await rig.opened.close();
});

describe('mounted drive space', () => {
  it('reports the person’s own drive against what is left of their quota', async () => {
    await rig.seedFile(rig.mine, 'notes.txt', 'twelve bytes');
    const used = rig.opened.store.driveQuotas.status(rig.ownerId).usage.live;
    rig.opened.store.driveQuotas.set(rig.ownerId, used + 1000);
    const space = await fsSpace(spaceEnvOf(rig), rig.owner(), rig.mine.id, undefined);
    expect(space.freeBytes).toBe(1000);
    expect(space.usedBytes).toBe(rig.opened.store.driveRoots.byId(rig.mine.id).bytes);
    expect(space.totalBytes).toBe(space.usedBytes + 1000);
  });

  it('reports the data folder disk free space when no quota is set', async () => {
    const space = await fsSpace(spaceEnvOf(rig), rig.owner(), rig.mine.id, undefined);
    expect(space.freeBytes).toBe(DISK_FREE);
  });

  it('counts the Shared Drive against no one’s quota', async () => {
    rig.opened.store.driveQuotas.set(rig.ownerId, 1);
    const space = await fsSpace(spaceEnvOf(rig), rig.owner(), rig.shared.id, undefined);
    expect(space.freeBytes).toBe(DISK_FREE);
  });

  it('gives a person with a grant the folder size and never the sharer’s quota', async () => {
    const folder = await rig.seedFolder(rig.mine, 'Projects');
    rig.opened.store.driveQuotas.set(rig.ownerId, 5);
    rig.opened.store.driveGrants.set(
      { itemId: folder.id, profileId: rig.memberId, role: 'view' },
      rig.ownerId,
    );
    const space = await fsSpace(spaceEnvOf(rig), rig.member(), rig.mine.id, folder.id);
    expect(space).toEqual({
      totalBytes: folder.bytes + DISK_FREE,
      usedBytes: folder.bytes,
      freeBytes: DISK_FREE,
    });
  });

  it('refuses another person’s drive that was not shared', async () => {
    await expect(fsSpace(spaceEnvOf(rig), rig.owner(), rig.theirs.id, undefined)).rejects.toThrow();
  });
});
