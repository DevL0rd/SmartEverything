import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { folderCopiesOf } from '../../src/photos/folder-copies';
import { PhotoFolderStore } from '../../src/photos/folder-store';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { ProfilesRepository } from '../../src/store/repositories/profiles';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';
import { insertDriveRow, insertInode } from './photo-rows';

const NOW = '2026-11-15T00:00:00.000Z';
const ROOT = '0f000000-0000-4000-8000-0000000000a1';
const HOME = '0f000000-0000-4000-8000-0000000000a2';
const PHONE = 'backup-phone';
const LAPTOP = 'backup-laptop';
const CAMERA = { key: 'phone:DCIM/Camera', name: 'Camera' } as const;
const SAVED = { key: 'phone:Pictures/Saved', name: 'Saved' } as const;

type Fields = Record<string, string | number | null>;

let database: DatabaseSync;
let context: StoreContext;
let alice: string;

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

function photo(n: number, root = ROOT): string {
  const id = itemId(n);
  insert('drive_items', {
    id,
    root_id: root,
    inode_id: insertInode(database, root),
    parent_id: null,
    rel_path: `${String(n)}.jpg`,
    name: `${String(n)}.jpg`,
    kind: 'image',
    mime: 'image/jpeg',
    bytes: n * 100,
    integrity: 'ok',
    modified_at: NOW,
    added_at: NOW,
    rev: 1,
    etag: `etag-${id}`,
    outside: 0,
    thumb_state: 'none',
    taken_at: NOW,
    child_count: null,
  });
  return id;
}

function backedUp(
  device: string,
  localId: string,
  item: string,
  origin: typeof CAMERA | typeof SAVED,
): void {
  insert('drive_backup_assets', {
    backup_device_id: device,
    local_id: localId,
    item_id: item,
    sha256: 'a'.repeat(64),
    state: 'verified',
    at: NOW,
  });
  new PhotoFolderStore(context.sql).saveOrigin(device, localId, origin);
}

function backupDevice(id: string, name: string): void {
  insert('drive_backup_devices', {
    id,
    profile_id: alice,
    device_id: `hub-${id}`,
    name,
    platform: 'android',
    last_seen_at: NOW,
    settings: '{}',
  });
}

function copies(localIds: readonly string[]): ReturnType<typeof folderCopiesOf> {
  return folderCopiesOf(
    context.sql,
    { profileId: alice, backupDeviceId: PHONE },
    { deviceId: `hub-${PHONE}`, folderKey: CAMERA.key, localIds },
  );
}

beforeEach(() => {
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const log = testLogger();
  context = new StoreContext(new Sql(database), new ChangeFeed(log), () => new Date(NOW));
  migrate(context.sql, MIGRATIONS, NOW, log);
  alice = new ProfilesRepository(context).create({ name: 'Alice' }).id;
  insertDriveRow(database, { id: ROOT, scope: 'person', ownerId: alice });
  insertDriveRow(database, { id: HOME, scope: 'home', ownerId: null });
  database.exec('pragma foreign_keys = off');
  backupDevice(PHONE, 'Pixel 8');
  backupDevice(LAPTOP, 'Laptop');
});

afterEach(() => {
  database.close();
});

describe('the hub copies one folder on one device backed up', () => {
  it('selects the copies that came only from that folder with their size and local ids', () => {
    const first = photo(1);
    const second = photo(2);
    backedUp(PHONE, 'local-1', first, CAMERA);
    backedUp(PHONE, 'local-2', second, CAMERA);
    backedUp(PHONE, 'local-2b', second, CAMERA);
    const answer = copies(['local-1', 'local-2', 'local-2b']);
    expect(answer.kept).toEqual([]);
    expect(answer.items).toEqual([
      { itemId: first, bytes: 100, localIds: ['local-1'] },
      { itemId: second, bytes: 200, localIds: ['local-2', 'local-2b'] },
    ]);
  });

  it('leaves out local ids the device did not ask about and other folders', () => {
    const first = photo(1);
    const saved = photo(2);
    backedUp(PHONE, 'local-1', first, CAMERA);
    backedUp(PHONE, 'local-2', saved, SAVED);
    expect(copies(['local-2']).items).toEqual([]);
    expect(copies(['local-1', 'local-2']).items.map((item) => item.itemId)).toEqual([first]);
  });

  it('keeps a copy that also came from another device', () => {
    const shared = photo(1);
    backedUp(PHONE, 'local-1', shared, CAMERA);
    backedUp(LAPTOP, 'laptop-1', shared, CAMERA);
    expect(copies(['local-1'])).toEqual({
      items: [],
      kept: [{ itemId: shared, reason: 'other_device' }],
    });
  });

  it('keeps a copy that also came from another folder on the same device', () => {
    const twice = photo(1);
    backedUp(PHONE, 'local-1', twice, CAMERA);
    backedUp(PHONE, 'local-9', twice, SAVED);
    expect(copies(['local-1']).kept).toEqual([{ itemId: twice, reason: 'other_folder' }]);
  });

  it('keeps a copy that lives in a shared home drive', () => {
    const home = photo(1, HOME);
    backedUp(PHONE, 'local-1', home, CAMERA);
    expect(copies(['local-1']).kept).toEqual([{ itemId: home, reason: 'shared' }]);
  });

  it('keeps a copy that was edited or had its date changed', () => {
    const edited = photo(1);
    const redated = photo(2);
    backedUp(PHONE, 'local-1', edited, CAMERA);
    backedUp(PHONE, 'local-2', redated, CAMERA);
    insert('photo_edits', {
      item_id: edited,
      profile_id: alice,
      recipe: '{}',
      base_version_id: null,
      result_sha256: 'b'.repeat(64),
      updated_at: NOW,
    });
    insert('photo_meta_overrides', { item_id: redated, taken_at: NOW, set_at: NOW });
    expect(copies(['local-1', 'local-2']).kept).toEqual([
      { itemId: edited, reason: 'edited' },
      { itemId: redated, reason: 'edited' },
    ]);
  });

  it('keeps a copy whose description was written by hand, not one read from the file', () => {
    const written = photo(1);
    const read = photo(2);
    backedUp(PHONE, 'local-1', written, CAMERA);
    backedUp(PHONE, 'local-2', read, CAMERA);
    insert('photo_descriptions', { item_id: written, text: 'Ours', source: 'manual', set_at: NOW });
    insert('photo_descriptions', { item_id: read, text: 'Camera', source: 'file', set_at: NOW });
    expect(copies(['local-1', 'local-2']).kept).toEqual([{ itemId: written, reason: 'edited' }]);
  });

  it('keeps a copy that was put in an album', () => {
    const kept = photo(1);
    backedUp(PHONE, 'local-1', kept, CAMERA);
    insert('drive_album_items', {
      album_id: itemId(900),
      item_id: kept,
      position: 1,
      added_at: NOW,
    });
    expect(copies(['local-1']).kept).toEqual([{ itemId: kept, reason: 'album' }]);
  });

  it('skips copies that are already gone from the hub', () => {
    backedUp(PHONE, 'local-1', itemId(77), CAMERA);
    expect(copies(['local-1'])).toEqual({ items: [], kept: [] });
  });
});
