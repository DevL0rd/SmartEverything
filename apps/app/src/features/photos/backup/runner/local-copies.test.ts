import { beforeEach, describe, expect, it } from 'vitest';
import { INITIAL_BACKUP_STATUS, backupStatus } from '../model/status';
import { rig, rowOf, type Rig } from './fixtures';
import { loadLedger } from './ledger-store';
import { loadLocalTrash } from './local-trash-store';

const ITEM_A = 'a1b2c3d4-0000-4000-8000-00000000000a';
const ITEM_B = 'a1b2c3d4-0000-4000-8000-00000000000b';
const HUB_ONLY = 'a1b2c3d4-0000-4000-8000-00000000000c';

async function backedUp(platform: 'android' | 'desktop' = 'android'): Promise<Rig> {
  const t = rig(platform);
  t.library.rows = [rowOf('a', 1000), rowOf('b', 2000)];
  t.upload.answers.set('a', { kind: 'done', itemId: ITEM_A, name: 'a.jpg', renamed: false });
  t.upload.answers.set('b', { kind: 'done', itemId: ITEM_B, name: 'b.jpg', renamed: false });
  await t.runner.request();
  return t;
}

describe('deleting a photo also deletes the copy on this device', () => {
  let t: Rig;

  beforeEach(async () => {
    backupStatus.set(INITIAL_BACKUP_STATUS);
    t = await backedUp();
  });

  it('moves the local copy of a deleted hub item to the system trash and forgets it', async () => {
    expect(await t.runner.trashLocalCopies([ITEM_A, HUB_ONLY])).toEqual({
      kind: 'done',
      asked: 1,
      changed: 1,
      place: 'phone',
    });
    expect(t.trash.calls).toEqual([{ ids: ['a'], trash: true }]);
    expect((await loadLedger(t.ports)).has('a')).toBe(false);
    expect(await loadLocalTrash(t.storage)).toEqual([
      { itemId: ITEM_A, localId: 'a', modificationTime: 1000 },
    ]);
  });

  it('leaves items that exist only on the hub alone', async () => {
    expect(await t.runner.trashLocalCopies([HUB_ONLY])).toEqual({ kind: 'none' });
    expect(t.trash.calls).toEqual([]);
  });

  it('keeps the local copy and its backup record when the system screen is declined', async () => {
    t.trash.outcome = 'declined';
    expect(await t.runner.trashLocalCopies([ITEM_A])).toMatchObject({
      kind: 'declined',
      changed: 0,
    });
    expect((await loadLedger(t.ports)).has('a')).toBe(true);
    expect(await loadLocalTrash(t.storage)).toEqual([]);
    const uploads = t.upload.started.length;
    await t.runner.request();
    expect(t.upload.started).toHaveLength(uploads);
  });

  it('never uploads a trashed copy again when it comes back outside the app', async () => {
    await t.runner.trashLocalCopies([ITEM_A]);
    t.library.rows = [rowOf('a', 1000), rowOf('b', 2000)];
    const hashed = t.native.hashed.length;
    await t.runner.request();
    expect(t.native.hashed).toHaveLength(hashed);
    expect(t.upload.started.map((request) => request.uri)).toEqual(['a', 'b']);
  });

  it('restores the local copy from the system trash with the hub copy', async () => {
    await t.runner.trashLocalCopies([ITEM_A, ITEM_B]);
    expect(await t.runner.restoreLocalCopies([ITEM_A])).toEqual({
      kind: 'done',
      asked: 1,
      changed: 1,
      place: 'phone',
    });
    expect(t.trash.calls.at(-1)).toEqual({ ids: ['a'], trash: false });
    expect((await loadLocalTrash(t.storage)).map((entry) => entry.itemId)).toEqual([ITEM_B]);
  });

  it('keeps the record for a later restore when the system screen is declined', async () => {
    await t.runner.trashLocalCopies([ITEM_A]);
    t.trash.outcome = 'declined';
    expect(await t.runner.restoreLocalCopies([ITEM_A])).toMatchObject({ kind: 'declined' });
    expect(await loadLocalTrash(t.storage)).toHaveLength(1);
  });

  it('says when this device cannot restore from its trash and drops the record', async () => {
    const desktop = await backedUp('desktop');
    await desktop.runner.trashLocalCopies([ITEM_B]);
    desktop.trash.outcome = 'unsupported';
    expect(await desktop.runner.restoreLocalCopies([ITEM_B])).toEqual({
      kind: 'unsupported',
      asked: 1,
      changed: 0,
      place: 'computer',
    });
    expect(await loadLocalTrash(desktop.storage)).toEqual([]);
  });

  it('restores nothing for items this device never trashed', async () => {
    expect(await t.runner.restoreLocalCopies([ITEM_A])).toEqual({ kind: 'none' });
    expect(t.trash.calls).toEqual([]);
  });
});
