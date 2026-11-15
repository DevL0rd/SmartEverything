import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { DRIVE_INODES_MIGRATION } from '../../src/store/migrations/drive-inodes';
import { DriveItemsRepository } from '../../src/store/repositories/drive-items';
import { DriveRootsRepository } from '../../src/store/repositories/drive-roots';
import { DriveTrashRepository } from '../../src/store/repositories/drive-trash';
import { ProfilesRepository } from '../../src/store/repositories/profiles';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';
import { drivePathOf, personalDriveRoot, sharedDriveRoot } from './drive-roots-fixture';

const NOW = '2026-11-14T00:00:00.000Z';
const MODIFIED = '2026-10-01T12:34:56.789Z';
const ADDED = '2026-09-01T00:00:00.000Z';
const ROOT = '0d000000-0000-4000-8000-000000000001';
const EMPTY_ROOT = '0d000000-0000-4000-8000-000000000002';
const FOLDER = '0d000000-0000-4000-8000-000000000011';
const FIRST = '0d000000-0000-4000-8000-000000000012';
const SECOND = '0d000000-0000-4000-8000-000000000013';
const SOLO = '0d000000-0000-4000-8000-000000000014';
const PHOTO = '0d000000-0000-4000-8000-000000000015';
const TRASHED = '0d000000-0000-4000-8000-000000000016';
const TRASHED_FOLDER = '0d000000-0000-4000-8000-000000000017';
const TRASHED_CHILD = '0d000000-0000-4000-8000-000000000018';
const SHA = 'a'.repeat(64);

type Fields = Record<string, string | number | null>;

let database: DatabaseSync;
let sql: Sql;
let log: ReturnType<typeof testLogger>;

function insert(table: string, fields: Fields): void {
  const columns = Object.keys(fields);
  database
    .prepare(
      `insert into ${table} (${columns.join(', ')}) values (${columns.map(() => '?').join(', ')})`,
    )
    .run(...Object.values(fields));
}

function item(id: string, fields: Fields): Fields {
  return {
    id,
    root_id: ROOT,
    parent_id: null,
    rel_path: id,
    name: id,
    kind: 'document',
    mime: 'text/plain',
    bytes: 10,
    child_count: null,
    sha256: null,
    integrity: 'unknown',
    dev: '7',
    ino: id,
    modified_at: MODIFIED,
    added_at: ADDED,
    rev: 1,
    etag: 'etag',
    outside: 0,
    thumb_state: 'none',
    ...fields,
  };
}

function folder(id: string, fields: Fields): Fields {
  return item(id, { kind: 'folder', mime: null, child_count: 0, ...fields });
}

const INODE = z.object({
  id: z.number(),
  root_id: z.string(),
  is_root: z.number(),
  type: z.string(),
  mode: z.number(),
  uid: z.number().nullable(),
  mtime_ns: z.string(),
  btime_ns: z.string(),
  orphan: z.number(),
});

function inodeOf(itemId: string): z.output<typeof INODE> {
  return INODE.parse(
    database
      .prepare(
        `select n.id, n.root_id, n.is_root, n.type, n.mode, n.uid, cast(n.mtime_ns as text) as mtime_ns,
          cast(n.btime_ns as text) as btime_ns, n.orphan
        from drive_inodes n join drive_items i on i.inode_id = n.id where i.id = ?`,
      )
      .get(itemId),
  );
}

function stash(itemId: string, seq: number, trashItemId: string = itemId): void {
  const row = database.prepare('select * from drive_items where id = ?').get(itemId);
  insert('drive_trash_rows', {
    trash_item_id: trashItemId,
    seq,
    table_name: 'drive_items',
    row: JSON.stringify(row),
  });
}

function violations(): number {
  return database.prepare('pragma foreign_key_check').all().length;
}

function count(text: string): number {
  return z.object({ count: z.number() }).parse(database.prepare(text).get()).count;
}

beforeEach(() => {
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  sql = new Sql(database);
  log = testLogger();
  migrate(
    sql,
    MIGRATIONS.filter((migration) => migration.version < DRIVE_INODES_MIGRATION.version),
    NOW,
    log,
  );
  const context = new StoreContext(sql, new ChangeFeed(log), () => new Date(NOW));
  const owner = new ProfilesRepository(context).create({ name: 'Robin' }).id;
  const roots = new DriveRootsRepository(context, drivePathOf);
  roots.insert(sharedDriveRoot(ROOT));
  roots.insert(personalDriveRoot(EMPTY_ROOT, owner));
  insert('drive_items', folder(FOLDER, { rel_path: 'docs', name: 'docs' }));
  insert(
    'drive_items',
    item(FIRST, { parent_id: FOLDER, rel_path: 'docs/a.txt', name: 'a.txt', ino: '100' }),
  );
  insert(
    'drive_items',
    item(SECOND, {
      parent_id: FOLDER,
      rel_path: 'docs/b.txt',
      name: 'b.txt',
      ino: '100',
      modified_at: ADDED,
    }),
  );
  insert('drive_items', item(SOLO, { rel_path: 'solo.txt', name: 'solo.txt', ino: '101' }));
  insert(
    'drive_items',
    item(PHOTO, {
      rel_path: 'p.jpg',
      name: 'p.jpg',
      kind: 'image',
      mime: 'image/jpeg',
      sha256: SHA,
      ino: '102',
    }),
  );
  insert('drive_media', {
    item_id: PHOTO,
    time_source: 'modified',
    preview_state: 'none',
    poster_state: 'none',
    playable_state: 'none',
  });
  insert('drive_stars', { profile_id: owner, item_id: SOLO });
  const trash = new DriveTrashRepository(context);
  insert('drive_items', item(TRASHED, { rel_path: 'gone.txt', name: 'gone.txt', ino: '200' }));
  insert('drive_items', folder(TRASHED_FOLDER, { rel_path: 'gone', name: 'gone', ino: '201' }));
  insert(
    'drive_items',
    item(TRASHED_CHILD, {
      parent_id: TRASHED_FOLDER,
      rel_path: 'gone/c.txt',
      name: 'c.txt',
      ino: '202',
    }),
  );
  for (const id of [TRASHED, TRASHED_FOLDER]) {
    trash.insert({
      itemId: id,
      rootId: ROOT,
      name: id,
      originalRelPath: id,
      trashRelPath: `.trash/${id}`,
      isFolder: id === TRASHED_FOLDER,
      bytes: 10,
      deletedAt: NOW,
      purgeAt: '2026-12-14T00:00:00.000Z',
      deletedBy: null,
      addedByProfileId: null,
    });
    stash(id, 0);
  }
  stash(TRASHED_CHILD, 1, TRASHED_FOLDER);
  database.exec(`delete from drive_items where id in ('${TRASHED}', '${TRASHED_FOLDER}')`);
  migrate(sql, MIGRATIONS, NOW, log);
});

afterEach(() => {
  database.close();
});

describe('migrating drive items to inodes', () => {
  it('keeps every item, gives each name an inode and the two names of one disk file a shared one', () => {
    expect(count('select count(*) as count from drive_items')).toBe(5);
    const first = inodeOf(FIRST);
    const second = inodeOf(SECOND);
    expect(second.id).toBe(first.id);
    const others = new Set([FOLDER, SOLO, PHOTO].map((id) => inodeOf(id).id));
    expect(others.size).toBe(3);
    expect(others.has(first.id)).toBe(false);
    expect(count('select count(*) as count from drive_inodes where is_root = 0')).toBe(4);
  });

  it('gives folders mode 0755 and files 0644 with no owner and no orphans', () => {
    expect(inodeOf(FOLDER)).toMatchObject({ type: 'dir', mode: 0o755, uid: null, orphan: 0 });
    expect(inodeOf(SOLO)).toMatchObject({ type: 'file', mode: 0o644, uid: null, orphan: 0 });
  });

  it('carries the modified time to the nanosecond and the added time as birth time', () => {
    expect(BigInt(inodeOf(SOLO).mtime_ns)).toBe(BigInt(Date.parse(MODIFIED)) * 1_000_000n);
    expect(BigInt(inodeOf(SOLO).btime_ns)).toBe(BigInt(Date.parse(ADDED)) * 1_000_000n);
  });

  it('adds one root inode per drive, including a drive without items', () => {
    const roots = z
      .array(z.object({ root_id: z.string(), mode: z.number(), type: z.string() }))
      .parse(
        database
          .prepare(
            'select root_id, mode, type from drive_inodes where is_root = 1 order by root_id',
          )
          .all(),
      );
    expect(roots).toEqual([
      { root_id: ROOT, mode: 0o755, type: 'dir' },
      { root_id: EMPTY_ROOT, mode: 0o755, type: 'dir' },
    ]);
  });

  it('keeps the photo rows and the stars that pointed at items', () => {
    expect(count(`select count(*) as count from drive_media where item_id = '${PHOTO}'`)).toBe(1);
    expect(count(`select count(*) as count from drive_stars where item_id = '${SOLO}'`)).toBe(1);
    expect(violations()).toBe(0);
  });

  it('leaves the foreign key check clean and the inode of a deleted name released', () => {
    database.exec(`delete from drive_items where id = '${SOLO}'`);
    expect(count('select count(*) as count from drive_inodes where is_root = 0')).toBe(3);
    database.exec(`delete from drive_items where id = '${FIRST}'`);
    expect(count('select count(*) as count from drive_inodes where is_root = 0')).toBe(3);
    database.exec(`delete from drive_items where id = '${SECOND}'`);
    expect(count('select count(*) as count from drive_inodes where is_root = 0')).toBe(2);
  });

  it('gives trashed items inodes that come back when they are restored', () => {
    const context = new StoreContext(sql, new ChangeFeed(log), () => new Date(NOW));
    const trash = new DriveTrashRepository(context);
    new DriveItemsRepository(context).write({
      item: {
        id: TRASHED_FOLDER,
        rootId: ROOT,
        parentId: null,
        relPath: 'gone',
        name: 'gone',
        kind: 'folder',
        childCount: 0,
        bytes: 0,
        modifiedAt: MODIFIED,
        addedAt: ADDED,
        starred: false,
        shared: false,
        outside: false,
        addedByProfileId: null,
        remoteId: null,
        remoteRev: null,
      },
      identity: { dev: '7', ino: '201' },
    });
    const rows = trash.stashed(TRASHED_FOLDER);
    trash.reinstate(TRASHED_FOLDER, rows, 'gone');
    expect(count(`select count(*) as count from drive_items where id = '${TRASHED_CHILD}'`)).toBe(
      1,
    );
    expect(inodeOf(TRASHED_CHILD)).toMatchObject({ type: 'file', mode: 0o644 });
    expect(violations()).toBe(0);
  });

  it('never reuses an inode number given to a trashed item', () => {
    const stashedIds = z
      .array(z.object({ id: z.number() }))
      .parse(
        database
          .prepare(
            `select json_extract(row, '$.id') as id from drive_trash_rows where table_name = 'drive_inodes'`,
          )
          .all(),
      )
      .map((row) => row.id);
    expect(stashedIds.length).toBe(3);
    database.exec(
      `insert into drive_inodes (root_id, is_root, type, mode, atime_ns, mtime_ns, ctime_ns, btime_ns, orphan)
        values ('${ROOT}', 0, 'file', 420, 1, 1, 1, 1, 0)`,
    );
    const fresh = count('select max(id) as count from drive_inodes');
    expect(stashedIds.every((id) => id < fresh)).toBe(true);
  });

  it('creates a root inode for a drive added after the migration', () => {
    const context = new StoreContext(sql, new ChangeFeed(log), () => new Date(NOW));
    const other = new ProfilesRepository(context).create({ name: 'Sam' }).id;
    new DriveRootsRepository(context, drivePathOf).insert(
      personalDriveRoot('0d000000-0000-4000-8000-000000000003', other),
    );
    expect(count('select count(*) as count from drive_inodes where is_root = 1')).toBe(3);
  });
});
