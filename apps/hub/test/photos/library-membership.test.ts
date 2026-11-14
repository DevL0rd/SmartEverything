import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LibraryReader } from '../../src/photos/library';
import { DuplicatesService } from '../../src/photos/duplicates';
import { DriveBackupRepository } from '../../src/store/repositories/drive-backup';
import { DriveTrashRepository } from '../../src/store/repositories/drive-trash';
import { PHOTOS_LIBRARY_MIGRATION } from '../../src/store/migrations/photos-library';
import {
  BOB_ROOT,
  HOME_ROOT,
  NOW,
  alice,
  bob,
  context,
  database,
  insert,
  insertPhone,
  rail,
  seed as seedItem,
  setup,
  teardown,
} from './insights-fixture';

beforeEach(() => {
  setup();
});
afterEach(teardown);

function seed(input: Parameters<typeof seedItem>[0]): string {
  const id = seedItem(input);
  database.prepare('delete from drive_photo_library where item_id = ?').run(id);
  return id;
}

function backup(itemId: string, state = 'verified', localId = randomUUID()): string {
  const device = insertPhone(alice.profileId, 'Phone', []);
  new DriveBackupRepository(context).saveAsset({
    backup_device_id: device,
    local_id: localId,
    item_id: itemId,
    sha256: 'a'.repeat(64),
    state: state === 'verified' ? 'verified' : 'uploaded',
    at: NOW,
  });
  return device;
}

function visible(actor = alice): readonly string[] {
  return new LibraryReader(context, () => 'UTC').page(actor, '2026-03', { filter: 'all' }).ids;
}

describe('backup Photos membership', () => {
  it('shows verified backups without selecting the whole managed root and counts each item once', () => {
    const photo = seed({ n: 1, takenAt: '2026-03-01T10:00:00.000Z', starred: true });
    const video = seed({ n: 2, takenAt: '2026-03-02T10:00:00.000Z', kind: 'video' });
    const pending = seed({ n: 3, takenAt: '2026-03-03T10:00:00.000Z' });
    seed({ n: 4, takenAt: '2026-03-04T10:00:00.000Z' });
    expect(visible()).toEqual([]);
    backup(photo);
    backup(photo);
    backup(video);
    backup(pending, 'uploaded');
    expect(visible()).toEqual([video, photo]);
    expect(new LibraryReader(context, () => 'UTC').buckets(alice, { filter: 'all' })).toEqual([
      { month: '2026-03', count: 2 },
    ]);
    expect(rail.read(alice)).toMatchObject({ library: 2, favourites: 1, videos: 1 });
  });

  it('keeps a backed-up item with the person whose drive holds it', () => {
    const shared = seed({ n: 1, takenAt: '2026-03-01T10:00:00.000Z' });
    const privatePhoto = seed({ n: 2, takenAt: '2026-03-02T10:00:00.000Z', root: BOB_ROOT });
    backup(shared);
    backup(privatePhoto);
    expect(visible(alice)).toEqual([shared]);
    expect(visible(bob)).toEqual([privatePhoto, shared]);
  });

  it('retains a backed-up photo after the source phone is removed', () => {
    const photo = seed({ n: 1, takenAt: '2026-03-01T10:00:00.000Z' });
    const device = backup(photo);
    new DriveBackupRepository(context).removeDevice(device);
    expect(visible()).toEqual([photo]);
  });

  it('includes verified backups in photo duplicates without admitting unrelated files', () => {
    const first = seed({ n: 1, takenAt: '2026-03-01T10:00:00.000Z', sha: 'a'.repeat(64) });
    const second = seed({ n: 2, takenAt: '2026-03-02T10:00:00.000Z', sha: 'a'.repeat(64) });
    seed({ n: 3, takenAt: '2026-03-03T10:00:00.000Z', sha: 'a'.repeat(64) });
    backup(first);
    backup(second);
    const duplicates = new DuplicatesService(context, {
      trash: (): Promise<void> => Promise.resolve(),
      star: (): Promise<void> => Promise.resolve(),
    });
    expect(duplicates.stats(alice, { media: true })).toMatchObject({ groups: 1, extraCopies: 1 });
  });

  it('preserves membership through trash and restore', () => {
    const photo = seed({ n: 1, takenAt: '2026-03-01T10:00:00.000Z' });
    backup(photo);
    const item = database.prepare('select * from drive_items where id = ?').get(photo);
    if (item === undefined) throw new Error('missing fixture item');
    insert('drive_trash', {
      item_id: photo,
      root_id: HOME_ROOT,
      name: '1.jpg',
      original_rel_path: '1.jpg',
      trash_rel_path: '1.jpg',
      is_folder: 0,
      bytes: 10,
      deleted_at: NOW,
      purge_at: '2027-11-07T00:00:00.000Z',
    });
    database.prepare('delete from drive_items where id = ?').run(photo);
    expect(visible()).toEqual([]);
    expect(rail.read(alice).deleted).toBe(1);
    new DriveTrashRepository(context).remove(photo);
    const columns = Object.keys(item);
    database
      .prepare(
        `insert into drive_items (${columns.join(',')}) values (${columns.map(() => '?').join(',')})`,
      )
      .run(...Object.values(item));
    expect(visible()).toEqual([photo]);
  });

  it('backfills existing verified backup items without including unverified or unrelated files', () => {
    const photo = seed({ n: 1, takenAt: '2026-03-01T10:00:00.000Z' });
    const pending = seed({ n: 2, takenAt: '2026-03-02T10:00:00.000Z' });
    backup(photo);
    backup(pending, 'uploaded');
    database.exec('drop table drive_photo_library');
    for (const statement of PHOTOS_LIBRARY_MIGRATION.statements) database.exec(statement);
    expect(visible()).toEqual([photo]);
  });
});
