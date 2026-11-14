import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PHOTOS_ENDPOINTS, PHOTO_RAIL_COUNTS } from '@smarteverything/domain';
import { LibraryReader } from '../../src/photos/library';
import {
  HOME_ROOT,
  NOW,
  alice,
  bob,
  context,
  insert,
  insertPhone,
  itemId,
  rail,
  seed,
  setup,
  teardown,
} from './insights-fixture';

beforeEach(setup);

afterEach(teardown);

describe('rail counts', () => {
  it('counts every section from the same photos the library shows', () => {
    seed({
      n: 1,
      takenAt: '2026-03-01T10:00:00.000Z',
      starred: true,
      sha: 'a'.repeat(64),
      placeId: '1001',
    });
    seed({ n: 2, takenAt: '2026-03-02T10:00:00.000Z', sha: 'a'.repeat(64), placeId: '1001' });
    seed({ n: 3, takenAt: '2026-03-03T10:00:00.000Z', name: 'Screenshot_2.png' });
    seed({ n: 4, takenAt: '2026-03-04T10:00:00.000Z', kind: 'video', placeId: '1003' });
    insertPhone(alice.profileId, 'Pixel', []);
    insertPhone(alice.profileId, 'Galaxy', []);
    const counts = PHOTO_RAIL_COUNTS.parse(rail.read(alice));
    expect(counts).toMatchObject({
      library: 4,
      favourites: 1,
      videos: 1,
      screenshots: 1,
      places: 2,
      albums: 0,
      duplicates: 1,
      backupDevices: 2,
      deleted: 0,
    });
    const library = new LibraryReader(context, () => 'UTC')
      .buckets(alice, { filter: 'all' })
      .reduce((sum, bucket) => sum + bucket.count, 0);
    expect(counts.library).toBe(library);
  });

  it('counts duplicates for every person over what they can see and keeps their own phones', () => {
    seed({ n: 1, takenAt: '2026-03-01T10:00:00.000Z', sha: 'b'.repeat(64) });
    seed({ n: 2, takenAt: '2026-03-02T10:00:00.000Z', sha: 'b'.repeat(64) });
    insertPhone(bob.profileId, 'Galaxy', []);
    const counts = rail.read(alice);
    expect(counts.duplicates).toBe(1);
    expect(counts.backupDevices).toBe(0);
    expect(rail.read(bob).backupDevices).toBe(1);
    expect(rail.read(bob).duplicates).toBe(1);
  });

  it('counts albums a person can see and photos in the trash', () => {
    insert('drive_albums', {
      id: randomUUID(),
      title: 'Home',
      kind: 'manual',
      surface: 'photos',
      scope: 'home',
      item_count: 0,
      created_at: NOW,
      updated_at: NOW,
    });
    insert('drive_albums', {
      id: randomUUID(),
      title: 'Bob',
      kind: 'manual',
      surface: 'photos',
      scope: 'person',
      owner_profile_id: bob.profileId,
      item_count: 0,
      created_at: NOW,
      updated_at: NOW,
    });
    insert('drive_photo_library', { item_id: itemId(1), root_id: HOME_ROOT });
    insert('drive_trash', {
      item_id: itemId(1),
      root_id: HOME_ROOT,
      name: 'a.jpg',
      original_rel_path: 'a.jpg',
      trash_rel_path: 'a.jpg',
      is_folder: 0,
      bytes: 1,
      deleted_at: NOW,
      purge_at: '2027-11-07T00:00:00.000Z',
    });
    expect(rail.read(alice)).toMatchObject({ albums: 1, deleted: 1 });
    expect(rail.read(bob)).toMatchObject({ albums: 2, deleted: 1 });
  });

  it('serves the counts on a member endpoint', () => {
    const endpoint = PHOTOS_ENDPOINTS.readPhotoRailCounts;
    expect(endpoint.path).toBe('/api/drive/photos/rail-counts');
    expect(endpoint.access).toBe('member');
  });
});
