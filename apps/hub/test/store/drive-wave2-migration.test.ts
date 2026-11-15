import { availableParallelism } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { DRIVE_WAVE2_MIGRATION } from '../../src/store/migrations/drive-wave2';
import { DriveRootsRepository } from '../../src/store/repositories/drive-roots';
import { ProfilesRepository } from '../../src/store/repositories/profiles';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';
import { drivePathOf, personalDriveRoot, sharedDriveRoot } from './drive-roots-fixture';

const NOW = '2026-11-14T00:00:00.000Z';
const OPENED = '2026-11-10T00:00:00.000Z';

const id = (group: string, index: number): string =>
  `${group}000000-0000-4000-8000-${String(index).padStart(12, '0')}`;

const SHARED = id('0a', 1);
const ROBIN_ROOT = id('0a', 2);
const SAM_ROOT = id('0a', 3);
const ROBIN_OPENED = id('0b', 1);
const ROBIN_UNOPENED = id('0b', 2);
const SHARED_OPENED = id('0b', 3);
const SAM_OPENED = id('0b', 4);
const GRANT = id('0c', 1);

type Fields = Record<string, string | number | null>;

let database: DatabaseSync;
let sql: Sql;
let robin: string;
let sam: string;

function insert(table: string, fields: Fields): void {
  const columns = Object.keys(fields);
  database
    .prepare(
      `insert into ${table} (${columns.join(', ')}) values (${columns.map(() => '?').join(', ')})`,
    )
    .run(...Object.values(fields));
}

function item(itemId: string, rootId: string, name: string, openedAt: string | null): void {
  insert('drive_items', {
    id: itemId,
    root_id: rootId,
    parent_id: null,
    rel_path: name,
    name,
    kind: 'document',
    mime: 'text/plain',
    bytes: 10,
    integrity: 'unknown',
    modified_at: NOW,
    added_at: NOW,
    opened_at: openedAt,
    rev: 1,
    etag: 'etag',
    outside: 0,
    thumb_state: 'none',
  });
}

function rows<T extends z.ZodType>(schema: T, text: string): z.output<T>[] {
  return z.array(schema).parse(database.prepare(text).all());
}

beforeEach(() => {
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  sql = new Sql(database);
  const log = testLogger();
  migrate(
    sql,
    MIGRATIONS.filter((migration) => migration.version < DRIVE_WAVE2_MIGRATION.version),
    NOW,
    log,
  );
  const context = new StoreContext(sql, new ChangeFeed(log), () => new Date(NOW));
  const profiles = new ProfilesRepository(context);
  robin = profiles.create({ name: 'Robin' }).id;
  sam = profiles.create({ name: 'Sam' }).id;
  const roots = new DriveRootsRepository(context, drivePathOf);
  roots.insert(sharedDriveRoot(SHARED));
  roots.insert(personalDriveRoot(ROBIN_ROOT, robin));
  roots.insert(personalDriveRoot(SAM_ROOT, sam));
  item(ROBIN_OPENED, ROBIN_ROOT, 'a.txt', OPENED);
  item(ROBIN_UNOPENED, ROBIN_ROOT, 'b.txt', null);
  item(SHARED_OPENED, SHARED, 'c.txt', OPENED);
  item(SAM_OPENED, SAM_ROOT, 'd.txt', OPENED);
  insert('drive_grants', {
    id: GRANT,
    item_id: ROBIN_OPENED,
    profile_id: sam,
    role: 'view',
    granted_by: robin,
    created_at: NOW,
  });
  migrate(sql, MIGRATIONS, NOW, log);
});

afterEach(() => {
  database.close();
});

describe('migrating Drive to wave 2', () => {
  it('creates every wave 2 table', () => {
    const names = rows(
      z.object({ name: z.string() }),
      "select name from sqlite_master where type = 'table' and name like 'drive_%' order by name",
    ).map((row) => row.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'drive_access_requests',
        'drive_comments',
        'drive_file_request_uploads',
        'drive_file_requests',
        'drive_folder_colours',
        'drive_folder_icons',
        'drive_item_locks',
        'drive_item_text',
        'drive_item_text_search',
        'drive_notifications',
        'drive_offline_items',
        'drive_opens',
        'drive_shortcuts',
        'drive_transfers',
      ]),
    );
  });

  it('moves opens of personal drives to their owners and drops Shared Drive opens', () => {
    expect(
      rows(
        z.object({ profile_id: z.string(), item_id: z.string(), opened_at: z.string() }),
        'select profile_id, item_id, opened_at from drive_opens order by item_id',
      ),
    ).toEqual([
      { profile_id: robin, item_id: ROBIN_OPENED, opened_at: OPENED },
      { profile_id: sam, item_id: SAM_OPENED, opened_at: OPENED },
    ]);
  });

  it('drops the shared opened column and its index', () => {
    const columns = rows(z.object({ name: z.string() }), 'pragma table_info(drive_items)').map(
      (row) => row.name,
    );
    expect(columns).not.toContain('opened_at');
    expect(
      rows(
        z.object({ name: z.string() }),
        "select name from sqlite_master where name = 'drive_items_by_opened'",
      ),
    ).toEqual([]);
  });

  it('keeps items and grants and gives grants an empty expiry', () => {
    expect(rows(z.object({ n: z.number() }), 'select count(*) as n from drive_items')).toEqual([
      { n: 4 },
    ]);
    expect(
      rows(
        z.object({ id: z.string(), expires_at: z.null() }),
        'select id, expires_at from drive_grants',
      ),
    ).toEqual([{ id: GRANT, expires_at: null }]);
  });

  it('adds the content settings to the stored drive settings and keeps the rest', () => {
    const [row] = rows(
      z.object({ settings: z.string() }),
      "select settings from ai_settings where key = 'drive'",
    );
    expect(JSON.parse(row?.settings ?? '')).toEqual({
      uploadExpiryDays: 7,
      membersMayShare: false,
      duplicatesHashing: true,
      indexingPaused: false,
      contentIndexing: true,
      ocrLanguages: ['eng'],
      fileIoThreads: 8,
      cpuWorkers: availableParallelism(),
      listingCacheSeconds: 300,
    });
  });

  it('leaves no foreign key violation', () => {
    expect(database.prepare('pragma foreign_key_check').all()).toEqual([]);
  });

  it('removes a person opens, comments and colours with the item', () => {
    insert('drive_folder_colours', { profile_id: robin, item_id: ROBIN_OPENED, colour: 'viz-3' });
    database.prepare('delete from drive_items where id = ?').run(ROBIN_OPENED);
    expect(rows(z.object({ n: z.number() }), 'select count(*) as n from drive_opens')).toEqual([
      { n: 1 },
    ]);
    expect(
      rows(z.object({ n: z.number() }), 'select count(*) as n from drive_folder_colours'),
    ).toEqual([{ n: 0 }]);
  });

  it('refuses a colour outside the palette', () => {
    expect(() => {
      insert('drive_folder_colours', { profile_id: robin, item_id: ROBIN_OPENED, colour: 'red' });
    }).toThrow();
  });
});
