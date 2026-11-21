import { DatabaseSync } from 'node:sqlite';
import type { LibraryScope } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DriveActor } from '../../src/drive/access';
import { PhotoFolderService } from '../../src/photos/folder-service';
import { PhotoFolderStore } from '../../src/photos/folder-store';
import { LibraryReader } from '../../src/photos/library';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { ProfilesRepository } from '../../src/store/repositories/profiles';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';
import { insertDriveRow, recordLibraryRow, insertInode } from './photo-rows';

const NOW = '2026-11-14T00:00:00.000Z';
const ROOT = '0f000000-0000-4000-8000-0000000000a1';
const PHOTOS = '0f000000-0000-4000-8000-0000000000f1';
const DEVICE = 'phone-device';
const BACKUP_DEVICE = 'backup-device';
const CAMERA = { key: 'phone:DCIM/Camera', name: 'Camera' } as const;
const SAVED = { key: 'phone:Pictures/Saved', name: 'Saved' } as const;

type Fields = Record<string, string | number | null>;

let database: DatabaseSync;
let context: StoreContext;
let feed: ChangeFeed;
let reader: LibraryReader;
let service: PhotoFolderService;
let alice: DriveActor;
let notices: unknown[];

function insert(table: string, fields: Fields): void {
  const columns = Object.keys(fields);
  database
    .prepare(
      `insert into ${table} (${columns.join(', ')}) values (${columns.map(() => '?').join(', ')})`,
    )
    .run(...Object.values(fields));
}

function itemId(n: number): string {
  return `0f000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

function driveItem(id: string, parent: string | null, relPath: string, kind: string): Fields {
  return {
    id,
    root_id: ROOT,
    inode_id: insertInode(database, ROOT),
    parent_id: parent,
    rel_path: relPath,
    name: relPath.split('/').at(-1) ?? relPath,
    kind,
    mime: kind === 'image' ? 'image/jpeg' : null,
    bytes: 10,
    integrity: 'unknown',
    modified_at: NOW,
    added_at: NOW,
    rev: 2,
    etag: `etag-${id}`,
    outside: 0,
    thumb_state: 'none',
    taken_at: kind === 'image' ? NOW : null,
    child_count: kind === 'folder' ? 0 : null,
  };
}

function photo(n: number, parent: string | null, takenAt: string): string {
  const id = itemId(n);
  const relPath = parent === null ? `${String(n)}.jpg` : `Photos/${String(n)}.jpg`;
  insert('drive_items', { ...driveItem(id, parent, relPath, 'image'), taken_at: takenAt });
  insert('drive_media', {
    item_id: id,
    time_source: 'metadata',
    preview_state: 'ready',
    poster_state: 'ready',
    playable_state: 'ready',
  });
  recordLibraryRow(database, { id, rootId: ROOT, kind: 'image', starred: false, inLibrary: true });
  return id;
}

function backedUp(localId: string, item: string, origin: typeof CAMERA | typeof SAVED): void {
  insert('drive_backup_assets', {
    backup_device_id: BACKUP_DEVICE,
    local_id: localId,
    item_id: item,
    sha256: 'a'.repeat(64),
    state: 'verified',
    at: NOW,
  });
  new PhotoFolderStore(context.sql).saveOrigin(BACKUP_DEVICE, localId, origin);
}

function total(scope: LibraryScope = { filter: 'all' }): number {
  return reader.buckets(alice, scope).reduce((sum, bucket) => sum + bucket.count, 0);
}

function hide(key: string, name: string, hidden = true): void {
  service.setHidden(alice, { key, name, hidden });
}

beforeEach(() => {
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const log = testLogger();
  feed = new ChangeFeed(log);
  context = new StoreContext(new Sql(database), feed, () => new Date(NOW));
  migrate(context.sql, MIGRATIONS, NOW, log);
  alice = { profileId: new ProfilesRepository(context).create({ name: 'Alice' }).id };
  insertDriveRow(database, { id: ROOT, scope: 'person', ownerId: alice.profileId });
  insert('drive_items', driveItem(PHOTOS, null, 'Photos', 'folder'));
  database.exec('pragma foreign_keys = off');
  insert('drive_backup_devices', {
    id: BACKUP_DEVICE,
    profile_id: alice.profileId,
    device_id: DEVICE,
    name: 'Pixel 8',
    platform: 'android',
    last_seen_at: NOW,
    settings: '{}',
  });
  database.exec('pragma foreign_keys = on');
  reader = new LibraryReader(context, () => 'UTC');
  service = new PhotoFolderService(
    { context, feed, write: <T>(work: () => T): T => context.write(work) },
    () => new Date(NOW),
  );
  notices = [];
  feed.subscribeNotices((notice) => notices.push(notice));
});

afterEach(() => {
  database.close();
});

describe('hidden Drive folders', () => {
  beforeEach(() => {
    photo(1, PHOTOS, '2026-10-01T10:00:00.000Z');
    photo(2, PHOTOS, '2026-10-02T10:00:00.000Z');
    photo(3, null, '2026-10-03T10:00:00.000Z');
  });

  it('leaves the photos of a hidden folder out of the library and brings them back', () => {
    expect(total()).toBe(3);
    hide(`drive:${PHOTOS}`, 'Photos');
    expect(total()).toBe(1);
    expect(total({ filter: 'all', folders: 'all' })).toBe(3);
    hide(`drive:${PHOTOS}`, 'Photos', false);
    expect(total()).toBe(3);
  });

  it('opens a folder with its own photos even while it is hidden', () => {
    hide(`drive:${PHOTOS}`, 'Photos');
    expect(total({ filter: 'all', folder: `drive:${PHOTOS}` })).toBe(2);
    expect(total({ filter: 'all', folder: `drive:${ROOT}` })).toBe(1);
  });

  it('lists each folder with its count, newest cover and hidden mark', () => {
    hide(`drive:${PHOTOS}`, 'Photos');
    const folders = service.list(alice).folders;
    expect(folders).toEqual([
      expect.objectContaining({
        key: `drive:${ROOT}`,
        name: 'My Drive',
        place: 'Drive',
        count: 1,
        hidden: false,
      }),
      expect.objectContaining({
        key: `drive:${PHOTOS}`,
        kind: 'drive',
        name: 'Photos',
        place: 'My Drive',
        count: 2,
        coverItemId: itemId(2),
        coverRev: 2,
        latestAt: '2026-10-02T10:00:00.000Z',
        hidden: true,
      }),
    ]);
  });

  it('keeps the hidden list per person and tells only on a change', () => {
    hide(`drive:${PHOTOS}`, 'Photos');
    hide(`drive:${PHOTOS}`, 'Photos again');
    expect(service.hidden(alice).folders).toEqual([
      { key: `drive:${PHOTOS}`, kind: 'drive', name: 'Photos again', hiddenAt: NOW },
    ]);
    hide('phone:Nowhere', 'Nowhere', false);
    expect(notices).toHaveLength(2);
    expect(notices[0]).toMatchObject({
      type: 'photos_folders_changed',
      profileId: alice.profileId,
    });
    const bob = { profileId: new ProfilesRepository(context).create({ name: 'Bob' }).id };
    expect(service.hidden(bob).folders).toEqual([]);
  });
});

describe('hidden phone albums and computer folders', () => {
  let camera: string;

  beforeEach(() => {
    camera = photo(4, PHOTOS, '2026-09-01T10:00:00.000Z');
    photo(5, PHOTOS, '2026-09-02T10:00:00.000Z');
    backedUp('local-4', camera, CAMERA);
  });

  it('hides a backed-up photo when the album it came from is hidden', () => {
    hide(CAMERA.key, CAMERA.name);
    expect(total()).toBe(1);
    expect(total({ filter: 'all', folder: CAMERA.key })).toBe(1);
  });

  it('keeps a photo that also came from an album that is still shown', () => {
    backedUp('local-4-copy', camera, SAVED);
    hide(CAMERA.key, CAMERA.name);
    expect(total()).toBe(2);
    hide(SAVED.key, SAVED.name);
    expect(total()).toBe(1);
  });

  it('lists the album with the phone it came from', () => {
    const origin = service.list(alice).folders.find((folder) => folder.key === CAMERA.key);
    expect(origin).toMatchObject({
      kind: 'phone',
      name: 'Camera',
      place: 'Pixel 8',
      count: 1,
      coverItemId: camera,
      hidden: false,
    });
  });

  it('forgets the album when the phone no longer reports one', () => {
    new PhotoFolderStore(context.sql).saveOrigin(BACKUP_DEVICE, 'local-4', null);
    hide(CAMERA.key, CAMERA.name);
    expect(total()).toBe(2);
  });
});

describe('the photo folders tables', () => {
  it('refuses a key that names no kind of folder', () => {
    expect(() => {
      insert('photo_hidden_folders', {
        profile_id: alice.profileId,
        folder_key: 'album:x',
        name: 'x',
        hidden_at: NOW,
      });
    }).toThrow();
  });

  it('refuses a Drive folder as the place a backup came from', () => {
    insert('drive_backup_assets', {
      backup_device_id: BACKUP_DEVICE,
      local_id: 'l',
      item_id: null,
      sha256: 'b'.repeat(64),
      state: 'uploading',
      at: NOW,
    });
    expect(() => {
      insert('photo_asset_folders', {
        backup_device_id: BACKUP_DEVICE,
        local_id: 'l',
        folder_key: `drive:${PHOTOS}`,
        folder_name: 'Photos',
      });
    }).toThrow();
  });
});
