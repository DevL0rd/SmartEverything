import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DriveCaller } from '../../../src/drive/service-write-support';
import { RailCountsReader } from '../../../src/photos/insights-rail';
import { LockedMover } from '../../../src/photos/organise/locked-move';
import { NOW, openFsRig, type FsRig } from '../../drive/fs-rig';

let rig: FsRig;

beforeEach(async () => {
  rig = await openFsRig();
  await rig.seedFolder(rig.mine, '.locked');
});
afterEach(async () => {
  await rig.opened.close();
});

function caller(lockedFolder?: 'open'): DriveCaller {
  return {
    profileId: rig.ownerId,
    owner: true,
    via: 'app',
    deviceId: null,
    ...(lockedFolder === undefined ? {} : { lockedFolder }),
  };
}

function deletedCount(): number {
  return new RailCountsReader(rig.opened.store.context, () => 0).read({ profileId: rig.ownerId })
    .deleted;
}

function listed(): readonly string[] {
  return rig.opened.store.driveTrash
    .inRoot(rig.mine.id, null, 100)
    .entries.map((entry) => entry.itemId);
}

describe('deleting a photo in the Locked folder through the real drive writer', () => {
  it('removes it for good with no trash row left behind', async () => {
    const photo = await rig.seedFile(rig.mine, '.locked/a.jpg', 'secret');
    const mover = new LockedMover({
      store: rig.opened.store,
      write: rig.service,
      now: (): Date => NOW,
    });
    await expect(mover.remove(caller(), { itemIds: [photo.id] })).resolves.toEqual({ count: 1 });
    const { store } = rig.opened;
    expect(store.driveItems.find(photo.id, null)).toBeUndefined();
    expect(store.driveTrash.find(photo.id)).toBeUndefined();
  });

  it('refuses to trash a Locked folder photo for a caller that has not unlocked it', async () => {
    const photo = await rig.seedFile(rig.mine, '.locked/a.jpg', 'secret');
    const result = await rig.service.change(caller(), { action: 'trash', itemIds: [photo.id] });
    expect(result.done).toEqual([]);
    expect(rig.opened.store.driveTrash.find(photo.id)).toBeUndefined();
  });

  it('keeps a trashed Locked folder photo out of Recently deleted and its count', async () => {
    await rig.seedFolder(rig.mine, 'Photos');
    const shown = await rig.seedFile(rig.mine, 'Photos/b.jpg', 'open');
    const photo = await rig.seedFile(rig.mine, '.locked/a.jpg', 'secret');
    for (const itemId of [shown.id, photo.id]) {
      rig.opened.store.context.sql.run(
        'keep the photo in the library',
        'insert or ignore into drive_photo_library (item_id, root_id) values ($itemId, $rootId)',
        { itemId, rootId: rig.mine.id },
      );
    }
    const trashed = await rig.service.change(caller('open'), {
      action: 'trash',
      itemIds: [photo.id, shown.id],
    });
    expect(trashed.done.map((done) => done.itemId).sort()).toEqual([photo.id, shown.id].sort());
    expect(rig.opened.store.driveTrash.find(photo.id)).toBeDefined();
    expect(listed()).toEqual([shown.id]);
    expect(deletedCount()).toBe(1);
  });
});
