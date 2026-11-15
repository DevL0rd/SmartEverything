import type { PhotoFolderCopies } from '@smarteverything/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { INITIAL_BACKUP_STATUS, backupStatus } from '../model/status';
import { CAMERA_PATH, rig, rowOf, type Rig } from './fixtures';
import { loadLedger } from './ledger-store';

const SAVED_PATH = 'Pictures/Saved/';
const ITEM_A = 'a1b2c3d4-0000-4000-8000-00000000000a';
const ITEM_B = 'a1b2c3d4-0000-4000-8000-00000000000b';

describe('the hub copies a folder on this device backed up', () => {
  let t: Rig;

  beforeEach(async () => {
    backupStatus.set(INITIAL_BACKUP_STATUS);
    t = rig();
    t.library.rows = [rowOf('a', 1000), rowOf('b', 2000), rowOf('s', 3000)];
    t.library.paths.set('s', SAVED_PATH);
    await t.runner.request();
  });

  it('asks the hub about the backed-up photos of that folder only, by its folder key', async () => {
    t.hub.copies = {
      items: [{ itemId: ITEM_A, bytes: 400, localIds: ['a'] }],
      kept: [{ itemId: ITEM_B, reason: 'album' }],
    };
    const copies = await t.runner.folderCopies([CAMERA_PATH]);
    expect(t.hub.copyAsks).toEqual([
      { deviceId: 'phone-1', folderKey: 'phone:DCIM/Camera', localIds: ['a', 'b'] },
    ]);
    expect(copies.items).toEqual([{ itemId: ITEM_A, bytes: 400, localIds: ['a'] }]);
    expect([...copies.kept]).toEqual([[ITEM_B, 'album']]);
  });

  it('merges several folders and never removes an item another folder keeps', async () => {
    let asks = 0;
    t.hub.folderCopies = (input): Promise<PhotoFolderCopies> => {
      t.hub.copyAsks.push(input);
      asks += 1;
      return Promise.resolve(
        asks === 1
          ? { items: [{ itemId: ITEM_A, bytes: 400, localIds: ['a'] }], kept: [] }
          : { items: [], kept: [{ itemId: ITEM_A, reason: 'other_folder' }] },
      );
    };
    const copies = await t.runner.folderCopies([CAMERA_PATH, SAVED_PATH]);
    expect(t.hub.copyAsks.map((ask) => ask.folderKey)).toEqual([
      'phone:DCIM/Camera',
      'phone:Pictures/Saved',
    ]);
    expect(copies.items).toEqual([]);
    expect([...copies.kept]).toEqual([[ITEM_A, 'other_folder']]);
  });

  it('asks nothing for a folder with no backed-up photos', async () => {
    const copies = await t.runner.folderCopies(['Download/']);
    expect(t.hub.copyAsks).toEqual([]);
    expect(copies.items).toEqual([]);
  });

  it('forgets the removed copies so turning backup on again uploads them anew', async () => {
    await t.runner.forgetFolderCopies(['a']);
    const ledger = await loadLedger(t.ports);
    expect(ledger.has('a')).toBe(false);
    expect(ledger.has('b')).toBe(true);
  });
});
