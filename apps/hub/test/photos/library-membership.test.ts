import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LibraryReader } from '../../src/photos/library';
import { DuplicatesService } from '../../src/photos/duplicates';
import { accessFilter } from '../../src/drive/access';
import {
  LIBRARY_VISIBLE,
  PHOTO_VISIBLE,
  libraryVisible,
  photoVisible,
} from '../../src/photos/membership';
import { photoRepositories } from '../../src/store/repositories/areas/photos';
import { DriveAlbumsRepository } from '../../src/store/repositories/drive-albums';
import { DriveBackupRepository } from '../../src/store/repositories/drive-backup';
import { DriveTrashRepository } from '../../src/store/repositories/drive-trash';
import { PHOTOS_LIBRARY_MIGRATION } from '../../src/store/migrations/photos-library';
import type { SqlFilter } from '../../src/store/sql';
import {
  type Fields,
  BOB_ROOT,
  HOME_ROOT,
  NOW,
  alice,
  bob,
  context,
  database,
  insert,
  insertPhone,
  insertRoot,
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
    const restored: Fields = {};
    for (const [column, value] of Object.entries(item)) {
      if (column === 'inode_id') continue;
      if (typeof value !== 'string' && typeof value !== 'number' && value !== null) {
        throw new Error(`unexpected ${column} value`);
      }
      restored[column] = value;
    }
    insert('drive_items', restored);
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

function shown(filter: SqlFilter): string[] {
  return database
    .prepare(
      `select i.id from drive_items i join drive_roots r on r.id = i.root_id
        where ${filter.text} order by i.id`,
    )
    .all(filter.parameters)
    .map((row) => String(row['id']));
}

describe('wave 2 Photos visibility', () => {
  const repos = (): ReturnType<typeof photoRepositories> => photoRepositories(context);

  function album(): { id: string; albums: DriveAlbumsRepository } {
    const albums = new DriveAlbumsRepository(context);
    const created = albums.insert({
      id: randomUUID(),
      title: 'Trip',
      kind: 'manual',
      surface: 'photos',
      scope: 'person',
      ownerProfileId: bob.profileId,
      coverItemId: null,
    });
    return { id: created.id, albums };
  }

  it('shows a member the photos contributed to a shared album and stops when they leave', () => {
    const owned = seedItem({ n: 1, takenAt: '2026-03-01T10:00:00.000Z', root: BOB_ROOT });
    const { id, albums } = album();
    albums.addItems(id, [owned]);
    expect(shown(photoVisible(alice))).toEqual([]);
    repos().photoAlbumMembers.invite(id, alice.profileId, 'viewer', bob.profileId);
    expect(shown(photoVisible(alice))).toEqual([owned]);
    expect(shown(libraryVisible(alice))).toEqual([owned]);
    repos().photoAlbumMembers.remove(id, alice.profileId);
    expect(shown(photoVisible(alice))).toEqual([]);
  });

  it('shows the album owner what a contributor added and removes it with the contribution', () => {
    const aliceRoot = '0f000000-0000-4000-8000-0000000000a1';
    insertRoot(aliceRoot, 'person', alice.profileId);
    const contributed = seedItem({ n: 1, takenAt: '2026-03-01T10:00:00.000Z', root: aliceRoot });
    const { id, albums } = album();
    repos().photoAlbumMembers.invite(id, alice.profileId, 'contributor', bob.profileId);
    albums.addItems(id, [contributed], alice.profileId);
    expect(shown(photoVisible(bob))).toContain(contributed);
    albums.removeContributions(id, alice.profileId);
    expect(shown(photoVisible(bob))).not.toContain(contributed);
  });

  it('does not let an unshared album show anything to a stranger', () => {
    const owned = seedItem({ n: 1, takenAt: '2026-03-01T10:00:00.000Z', root: BOB_ROOT });
    const { id, albums } = album();
    albums.addItems(id, [owned]);
    expect(shown(photoVisible(alice))).toEqual([]);
    expect(shown(photoVisible(bob))).toEqual([owned]);
  });

  it('shows an accepted partner all photos from the start day and nothing before an offer is accepted', () => {
    const old = seedItem({ n: 1, takenAt: '2025-12-31T10:00:00.000Z', root: BOB_ROOT });
    const fresh = seedItem({ n: 2, takenAt: '2026-02-01T10:00:00.000Z', root: BOB_ROOT });
    const share = repos().photoPartnerShares.insert({
      id: randomUUID(),
      sharerId: bob.profileId,
      recipientId: alice.profileId,
      scope: 'all',
      groupIds: [],
      fromDay: '2026-01-01',
    });
    expect(shown(photoVisible(alice))).toEqual([]);
    repos().photoPartnerShares.update(share.id, { state: 'accepted' });
    expect(shown(photoVisible(alice))).toEqual([fresh]);
    expect(old).not.toBe(fresh);
    repos().photoPartnerShares.update(share.id, { state: 'stopped' });
    expect(shown(photoVisible(alice))).toEqual([]);
  });

  it('shares chosen people through the sharer own groups only', () => {
    const withPerson = seedItem({ n: 1, takenAt: '2026-02-01T10:00:00.000Z', root: BOB_ROOT });
    const without = seedItem({ n: 2, takenAt: '2026-02-02T10:00:00.000Z', root: BOB_ROOT });
    const faces = repos().photoFaces;
    const groups = repos().photoGroups;
    const detection = (itemId: string, n: number): string => {
      const faceId = randomUUID();
      faces.replaceForItem(itemId, [
        {
          id: faceId,
          itemId,
          rev: n,
          kind: 'person',
          species: null,
          box: { x: 0, y: 0, w: 0.5, h: 0.5 },
          landmarks: null,
          score: 0.9,
          quality: 0.9,
          model: 'm',
          vector: new Uint8Array([1]),
        },
      ]);
      return faceId;
    };
    const chosen = groups.insert({
      id: randomUUID(),
      profileId: bob.profileId,
      kind: 'person',
      species: null,
      name: 'Mum',
      coverFaceId: null,
    });
    groups.assign(chosen.id, [detection(withPerson, 1)], 'auto');
    detection(without, 2);
    const share = repos().photoPartnerShares.insert({
      id: randomUUID(),
      sharerId: bob.profileId,
      recipientId: alice.profileId,
      scope: 'people',
      groupIds: [chosen.id],
      fromDay: '2026-01-01',
    });
    repos().photoPartnerShares.update(share.id, { state: 'accepted' });
    expect(shown(photoVisible(alice))).toEqual([withPerson]);
    expect(groups.forProfile(alice.profileId)).toEqual([]);
    repos().photoArchive.archive(bob.profileId, [withPerson]);
    expect(shown(photoVisible(alice))).toEqual([]);
  });

  it('keeps archived photos out of the Library but in everything else', () => {
    const kept = seedItem({ n: 1, takenAt: '2026-03-01T10:00:00.000Z' });
    const archived = seedItem({ n: 2, takenAt: '2026-03-02T10:00:00.000Z' });
    repos().photoArchive.archive(alice.profileId, [archived]);
    expect(shown(libraryVisible(alice))).toEqual([kept]);
    expect(shown(photoVisible(alice))).toEqual([kept, archived]);
    expect(shown(libraryVisible(bob))).toEqual([kept, archived]);
  });

  it('keeps the Locked folder out of every reader, Drive listings included', () => {
    const open = seedItem({ n: 1, takenAt: '2026-03-01T10:00:00.000Z', root: BOB_ROOT });
    const locked = seedItem({
      n: 2,
      takenAt: '2026-03-02T10:00:00.000Z',
      root: BOB_ROOT,
      name: '.locked/2.jpg',
    });
    const { id, albums } = album();
    albums.addItems(id, [locked, open]);
    repos().photoAlbumMembers.invite(id, alice.profileId, 'viewer', bob.profileId);
    expect(shown(photoVisible(bob))).toEqual([open]);
    expect(shown(libraryVisible(bob))).toEqual([open]);
    expect(shown(photoVisible(alice))).toEqual([open]);
    expect(shown(accessFilter(bob))).toEqual([open]);
  });

  it('plans the membership query on indexes', () => {
    const plan = database
      .prepare(
        `explain query plan select i.id from drive_items i join drive_roots r on r.id = i.root_id where ${LIBRARY_VISIBLE}`,
      )
      .all({ profile: alice.profileId })
      .map((row) => String(row['detail']))
      .join('\n');
    expect(plan).not.toMatch(/SCAN photo_(album_members|partner_shares|archive|group_faces)/);
    expect(plan).not.toMatch(/SCAN (drive_album_items|photo_faces)/);
    expect(PHOTO_VISIBLE.length).toBeLessThan(LIBRARY_VISIBLE.length);
  });
});
