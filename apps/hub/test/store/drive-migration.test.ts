import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { DRIVE_MIGRATION } from '../../src/store/migrations/drive';
import { ProfilesRepository } from '../../src/store/repositories/profiles';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';

const NOW = '2026-11-07T00:00:00.000Z';
const ROOT = '0d000000-0000-4000-8000-000000000001';
const VIRTUAL_ROOT = '0d000000-0000-4000-8000-000000000002';
const FOLDER = '0d000000-0000-4000-8000-000000000011';
const PHOTO = '0d000000-0000-4000-8000-000000000012';
const ALBUM = '0d000000-0000-4000-8000-000000000021';
const SHA = 'a'.repeat(64);

let database: DatabaseSync;
let person: string;

beforeEach(() => {
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const log = testLogger();
  const context = new StoreContext(new Sql(database), new ChangeFeed(log), () => new Date(NOW));
  migrate(
    context.sql,
    MIGRATIONS.filter((migration) => migration.version < DRIVE_MIGRATION.version),
    NOW,
    log,
  );
  person = new ProfilesRepository(context).create({ name: 'Robin' }).id;
  migrate(context.sql, MIGRATIONS, NOW, log);
});

afterEach(() => {
  database.close();
});

function insertRoot(id: string, fields: Record<string, string | number | null> = {}): void {
  const row: Record<string, string | number | null> = {
    id,
    kind: 'folder',
    label: 'Photos',
    scope: 'home',
    owner_profile_id: null,
    path: '/srv/photos',
    read_only: 0,
    versions: 0,
    synced: 0,
    index_id: 'index-1',
    state: 'ready',
    state_reason: null,
    items: 0,
    folders: 0,
    bytes: 0,
    scanned_at: null,
    hashed_share: 0,
    verified_share: 0,
    corrupt: 0,
    last_scrub_at: null,
    last_backup_at: null,
    in_photos: 0,
    skip_patterns: '[]',
    include_hidden: 0,
    volume: null,
    sync: null,
    created_at: NOW,
    updated_at: NOW,
    ...fields,
  };
  const columns = Object.keys(row);
  database
    .prepare(
      `insert into drive_roots (${columns.join(', ')}) values (${columns.map(() => '?').join(', ')})`,
    )
    .run(...Object.values(row));
}

function insertItem(id: string, fields: Record<string, string | number | null> = {}): void {
  const row: Record<string, string | number | null> = {
    id,
    root_id: ROOT,
    parent_id: null,
    rel_path: `file-${id}.jpg`,
    name: 'file.jpg',
    kind: 'image',
    mime: 'image/jpeg',
    bytes: 10,
    child_count: null,
    sha256: SHA,
    integrity: 'unknown',
    modified_at: NOW,
    added_at: NOW,
    starred: 0,
    rev: 1,
    etag: 'etag',
    outside: 0,
    thumb_state: 'none',
    ...fields,
  };
  const columns = Object.keys(row);
  database
    .prepare(
      `insert into drive_items (${columns.join(', ')}) values (${columns.map(() => '?').join(', ')})`,
    )
    .run(...Object.values(row));
}

function insertFolder(id: string, relPath: string): void {
  insertItem(id, {
    rel_path: relPath,
    name: relPath,
    kind: 'folder',
    mime: null,
    sha256: null,
    child_count: 0,
  });
}

it('creates every drive table as a strict table and the fts table', () => {
  const tables = database
    .prepare("select name, strict from pragma_table_list where name like 'drive\\_%' escape '\\'")
    .all();
  const strictOf = new Map(tables.map((table) => [table['name'], table['strict']]));
  for (const name of [
    'drive_roots',
    'drive_items',
    'drive_albums',
    'drive_album_items',
    'drive_trash',
    'drive_days',
    'drive_feed',
  ]) {
    expect(strictOf.get(name), name).toBe(1);
  }
  expect(strictOf.has('drive_items_search')).toBe(true);
});

it('creates the item indexes used by the listing, usage, media, duplicate, starred, recent and added windows', () => {
  const indexes = database
    .prepare("select name from pragma_index_list('drive_items') where origin = 'c'")
    .all()
    .map((index) => index['name']);
  expect(indexes.sort()).toEqual([
    'drive_items_by_added',
    'drive_items_by_adder',
    'drive_items_by_opened',
    'drive_items_by_parent',
    'drive_items_by_sha256',
    'drive_items_by_starred',
    'drive_items_by_taken',
  ]);
  const adder = database
    .prepare("select name from pragma_index_info('drive_items_by_adder')")
    .all();
  expect(adder).toEqual([{ name: 'added_by_profile_id' }]);
  const plan = database
    .prepare(
      'explain query plan select id from drive_items where root_id = ? and parent_id = ? order by name',
    )
    .all(ROOT, FOLDER);
  expect(JSON.stringify(plan)).toContain('drive_items_by_parent');
});

it('refuses a physical root without a path, a person root without an owner and a read-only root that keeps versions', () => {
  expect(() => {
    insertRoot(ROOT, { path: null });
  }).toThrow();
  expect(() => {
    insertRoot(ROOT, { scope: 'person' });
  }).toThrow();
  expect(() => {
    insertRoot(ROOT, { owner_profile_id: person });
  }).toThrow();
  expect(() => {
    insertRoot(ROOT, { read_only: 1, versions: 1 });
  }).toThrow();
  expect(() => {
    insertRoot(ROOT, { kind: 'volume' });
  }).toThrow();
  expect(() => {
    insertRoot(ROOT, { kind: 'managed', read_only: 1 });
  }).toThrow();
  expect(() => {
    insertRoot(ROOT, { synced: 1 });
  }).toThrow();
  expect(() => {
    insertRoot(ROOT, { hashed_share: 1.5 });
  }).toThrow();
  expect(() => {
    insertRoot(ROOT, { skip_patterns: '{}' });
  }).toThrow();
});

it('refuses the removed Google root kinds', () => {
  for (const kind of ['google_drive', 'google_photos']) {
    expect(() => {
      insertRoot(ROOT, { kind, path: null, read_only: 1, versions: 0, synced: 0 });
    }).toThrow();
  }
});

it('accepts a person root, a synced root and a virtual read-only root', () => {
  insertRoot(ROOT, { scope: 'person', owner_profile_id: person, synced: 1, sync: '{"a":1}' });
  insertRoot(VIRTUAL_ROOT, {
    kind: 'cameras',
    path: null,
    read_only: 1,
    versions: 0,
    synced: 0,
  });
  expect(database.prepare('select count(*) as n from drive_roots').get()).toEqual({ n: 2 });
  expect(() => {
    insertRoot('0d000000-0000-4000-8000-000000000003', {
      kind: 'ai_images',
      path: '/x',
      read_only: 1,
    });
  }).toThrow();
});

it('refuses malformed items and a duplicate path in one root', () => {
  insertRoot(ROOT);
  insertItem(PHOTO);
  expect(() => {
    insertItem('x1', { rel_path: 'file-0d.jpg', kind: 'folder' });
  }).toThrow();
  expect(() => {
    insertItem('x2', { rel_path: PHOTO });
  }).not.toThrow();
  expect(() => {
    insertItem('x3', { rel_path: `file-${PHOTO}.jpg` });
  }).toThrow();
  expect(() => {
    insertItem('x4', { sha256: 'ABC' });
  }).toThrow();
  expect(() => {
    insertItem('x5', { kind: 'document', mime: 'text/plain', width: 10 });
  }).toThrow();
  expect(() => {
    insertItem('x6', { place_lat: 10 });
  }).toThrow();
  expect(() => {
    insertItem('x7', { thumb_state: 'failed' });
  }).toThrow();
  expect(() => {
    insertItem('x8', { kind: 'document', mime: 'text/plain', taken_at: NOW });
  }).toThrow();
  expect(() => {
    insertItem('x9', { added_by_profile_id: 'missing-profile' });
  }).toThrow();
});

it('keeps the adding profile on items and trash entries and clears it when the profile is removed', () => {
  insertRoot(ROOT);
  insertItem(PHOTO, { added_by_profile_id: person });
  database
    .prepare(
      `insert into drive_trash
       (item_id, root_id, name, original_rel_path, trash_rel_path, is_folder, bytes, deleted_at, purge_at, deleted_by, added_by_profile_id)
       values ('t1', ?, 'a.jpg', 'a.jpg', '.trash/t1', 0, 5, ?, '2026-12-07T00:00:00.000Z', ?, ?)`,
    )
    .run(ROOT, NOW, person, person);
  database.prepare('delete from profiles where id = ?').run(person);
  expect(
    database.prepare('select added_by_profile_id from drive_items where id = ?').get(PHOTO),
  ).toEqual({ added_by_profile_id: null });
  expect(database.prepare('select deleted_by, added_by_profile_id from drive_trash').get()).toEqual(
    {
      deleted_by: null,
      added_by_profile_id: null,
    },
  );
});

it('refuses a trash entry that purges before it was deleted', () => {
  insertRoot(ROOT);
  expect(() =>
    database
      .prepare(
        `insert into drive_trash
         (item_id, root_id, name, original_rel_path, trash_rel_path, is_folder, bytes, deleted_at, purge_at)
         values ('t2', ?, 'a', 'a', '.trash/t2', 0, 0, ?, ?)`,
      )
      .run(ROOT, NOW, NOW),
  ).toThrow();
});

it('deletes the children, album links, days, trash and feed rows with their root', () => {
  insertRoot(ROOT);
  insertFolder(FOLDER, 'sub');
  insertItem(PHOTO, { parent_id: FOLDER, rel_path: 'sub/a.jpg' });
  database
    .prepare(
      `insert into drive_albums (id, title, kind, rule, surface, scope, owner_profile_id, cover_item_id, item_count, created_at, updated_at)
       values (?, 'Trip', 'manual', null, 'drive', 'home', null, ?, 1, ?, ?)`,
    )
    .run(ALBUM, PHOTO, NOW, NOW);
  database
    .prepare(
      'insert into drive_album_items (album_id, item_id, position, added_at) values (?, ?, 1, ?)',
    )
    .run(ALBUM, PHOTO, NOW);
  database
    .prepare(
      'insert into drive_days (day, root_id, items, bytes, added, removed) values (?, ?, 1, 10, 1, 0)',
    )
    .run('2026-11-07', ROOT);
  database
    .prepare(
      "insert into drive_feed (root_id, item_id, op, rev, at, via) values (?, ?, 'create', 1, ?, 'app')",
    )
    .run(ROOT, PHOTO, NOW);
  database.prepare('delete from drive_roots where id = ?').run(ROOT);
  for (const table of ['drive_items', 'drive_album_items', 'drive_days', 'drive_feed']) {
    expect(database.prepare(`select count(*) as n from ${table}`).get(), table).toEqual({ n: 0 });
  }
  expect(database.prepare('select cover_item_id from drive_albums').get()).toEqual({
    cover_item_id: null,
  });
});

it('numbers the feed with a sequence that is never reused and enforces the actor and device rules', () => {
  insertRoot(ROOT);
  const append = database.prepare(
    'insert into drive_feed (root_id, item_id, op, rev, at, actor_profile_id, via, device_id) values (?, ?, ?, 1, ?, ?, ?, ?)',
  );
  append.run(ROOT, PHOTO, 'create', NOW, person, 'app', null);
  append.run(ROOT, PHOTO, 'update', NOW, null, 'scan', null);
  database.prepare('delete from drive_feed where seq = 2').run();
  append.run(ROOT, PHOTO, 'trash', NOW, person, 'app', null);
  expect(database.prepare('select seq from drive_feed order by seq').all()).toEqual([
    { seq: 1 },
    { seq: 3 },
  ]);
  expect(() => append.run(ROOT, PHOTO, 'update', NOW, person, 'scan', null)).toThrow();
  expect(() => append.run(ROOT, PHOTO, 'update', NOW, person, 'sync', null)).toThrow();
  expect(() => append.run(ROOT, PHOTO, 'bogus', NOW, person, 'app', null)).toThrow();
  expect(() => append.run(ROOT, PHOTO, 'update', NOW, person, 'carrier', null)).toThrow();
});

it('refuses a smart album without a rule and a person album without an owner', () => {
  const insert = database.prepare(
    `insert into drive_albums (id, title, kind, rule, surface, scope, owner_profile_id, cover_item_id, item_count, created_at, updated_at)
     values (?, 'A', ?, ?, 'drive', ?, ?, null, 0, ?, ?)`,
  );
  expect(() => insert.run(ALBUM, 'smart', null, 'home', null, NOW, NOW)).toThrow();
  expect(() => insert.run(ALBUM, 'manual', '{}', 'home', null, NOW, NOW)).toThrow();
  expect(() => insert.run(ALBUM, 'manual', null, 'person', null, NOW, NOW)).toThrow();
  expect(() => insert.run(ALBUM, 'smart', '{}', 'person', person, NOW, NOW)).not.toThrow();
});

it('stores an album on the photos or the drive surface and refuses anything else', () => {
  const insert = database.prepare(
    `insert into drive_albums (id, title, kind, rule, surface, scope, owner_profile_id, cover_item_id, item_count, created_at, updated_at)
     values (?, 'A', 'manual', null, ?, 'home', null, null, 0, ?, ?)`,
  );
  expect(() => insert.run(ALBUM, 'photos', NOW, NOW)).not.toThrow();
  expect(() => insert.run('0d000000-0000-4000-8000-000000000022', 'drive', NOW, NOW)).not.toThrow();
  expect(() => insert.run('0d000000-0000-4000-8000-000000000023', 'files', NOW, NOW)).toThrow();
});

it('searches items by name, path, camera, album and date words', () => {
  const insert = database.prepare(
    'insert into drive_items_search (item_id, name, path, camera, albums, dates) values (?, ?, ?, ?, ?, ?)',
  );
  insert.run(PHOTO, 'beach.jpg', 'holidays summer', 'Pixel 9', 'Greece', '2026 July');
  insert.run(FOLDER, 'notes.txt', 'work', '', '', '2025 March');
  const find = (term: string): unknown[] =>
    database
      .prepare('select item_id from drive_items_search where drive_items_search match ? ')
      .all(term)
      .map((row) => row['item_id']);
  expect(find('beach')).toEqual([PHOTO]);
  expect(find('summer')).toEqual([PHOTO]);
  expect(find('pixel')).toEqual([PHOTO]);
  expect(find('greece')).toEqual([PHOTO]);
  expect(find('march')).toEqual([FOLDER]);
});

it('keeps the foreign keys consistent after the migration', () => {
  expect(database.prepare('pragma foreign_key_check').all()).toEqual([]);
});
