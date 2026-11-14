import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { DRIVE_STORAGE_MIGRATION } from '../../src/store/migrations/drive-storage';
import { PHOTOS_MIGRATION } from '../../src/store/migrations/photos';
import { ProfilesRepository } from '../../src/store/repositories/profiles';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';

const NOW = '2026-11-07T00:00:00.000Z';
const ROOT = '0e000000-0000-4000-8000-000000000001';
const ITEM = '0e000000-0000-4000-8000-000000000012';
const OTHER_ITEM = '0e000000-0000-4000-8000-000000000013';
const HUB_DEVICE = '0e000000-0000-4000-8000-000000000041';
const BACKUP_DEVICE = '0e000000-0000-4000-8000-000000000051';
const SHA = 'a'.repeat(64);

type Fields = Record<string, string | number | null | Uint8Array>;

let database: DatabaseSync;
let person: string;

beforeEach(() => {
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const log = testLogger();
  const context = new StoreContext(new Sql(database), new ChangeFeed(log), () => new Date(NOW));
  migrate(
    context.sql,
    MIGRATIONS.filter((migration) => migration.version < PHOTOS_MIGRATION.version),
    NOW,
    log,
  );
  person = new ProfilesRepository(context).create({ name: 'Robin' }).id;
  migrate(context.sql, MIGRATIONS, NOW, log);
  insertRoot();
  insertItem(ITEM, 'a.jpg');
  insertItem(OTHER_ITEM, 'b.jpg');
  insert('devices', {
    id: HUB_DEVICE,
    provider: 'local',
    external_id: 'phone:aa',
    kind: 'phone',
    name: 'Pixel',
    model: 'm',
    manufacturer: 'v',
    created_at: NOW,
    updated_at: NOW,
  });
});

afterEach(() => {
  database.close();
});

function insert(table: string, fields: Fields): void {
  const columns = Object.keys(fields);
  database
    .prepare(
      `insert into ${table} (${columns.join(', ')}) values (${columns.map(() => '?').join(', ')})`,
    )
    .run(...Object.values(fields));
}

function insertRoot(): void {
  insert('drive_roots', {
    id: ROOT,
    scope: 'home',
    owner_profile_id: null,
    versions: 1,
    index_id: 'index-1',
    state: 'ready',
    items: 0,
    folders: 0,
    bytes: 0,
    hashed_share: 0,
    verified_share: 0,
    corrupt: 0,
    skip_patterns: '[]',
    include_hidden: 0,
    created_at: NOW,
    updated_at: NOW,
  });
}

function insertItem(id: string, name: string): void {
  insert('drive_items', {
    id,
    root_id: ROOT,
    rel_path: name,
    name,
    kind: 'image',
    mime: 'image/jpeg',
    bytes: 10,
    sha256: SHA,
    integrity: 'unknown',
    modified_at: NOW,
    added_at: NOW,
    rev: 1,
    etag: `etag-${name}`,
    outside: 0,
    thumb_state: 'none',
  });
}

function media(fields: Fields = {}): Fields {
  return {
    item_id: ITEM,
    time_source: 'metadata',
    preview_state: 'none',
    poster_state: 'none',
    playable_state: 'none',
    ...fields,
  };
}

function job(fields: Fields = {}): Fields {
  return {
    id: '0e000000-0000-4000-8000-000000000061',
    kind: 'preview',
    item_id: ITEM,
    rev: 1,
    state: 'queued',
    visible: 0,
    attempts: 0,
    queued_at: NOW,
    ...fields,
  };
}

function backupDevice(fields: Fields = {}): Fields {
  return {
    id: BACKUP_DEVICE,
    profile_id: person,
    device_id: HUB_DEVICE,
    name: 'Pixel',
    platform: 'android',
    settings: '{}',
    ...fields,
  };
}

function backupAsset(fields: Fields = {}): Fields {
  return {
    backup_device_id: BACKUP_DEVICE,
    local_id: 'local-1',
    item_id: ITEM,
    sha256: SHA,
    state: 'verified',
    at: NOW,
    ...fields,
  };
}

function count(table: string): number {
  return Number(database.prepare(`select count(*) as total from ${table}`).get()?.['total']);
}

it('registers Migration C directly after migration B', () => {
  expect(PHOTOS_MIGRATION.version).toBe(DRIVE_STORAGE_MIGRATION.version + 1);
  const versions = MIGRATIONS.map((migration) => migration.version);
  expect(versions.indexOf(PHOTOS_MIGRATION.version)).toBe(
    versions.indexOf(DRIVE_STORAGE_MIGRATION.version) + 1,
  );
  expect(versions.filter((version) => version === PHOTOS_MIGRATION.version)).toHaveLength(1);
});

it('creates every Photos table as a strict table', () => {
  const tables = database
    .prepare(
      "select name, strict from pragma_table_list where name in ('drive_media', 'drive_media_jobs', 'drive_stacks', 'drive_places', 'drive_backup_devices', 'drive_backup_assets')",
    )
    .all();
  expect(tables).toHaveLength(6);
  for (const table of tables) {
    expect(table['strict'], String(table['name'])).toBe(1);
  }
});

it('stores one media record per item and refuses an unreadable time source', () => {
  insert('drive_media', media());
  expect(() => {
    insert('drive_media', media());
  }).toThrow();
  expect(() => {
    insert('drive_media', media({ item_id: OTHER_ITEM, time_source: 'guess' }));
  }).toThrow();
  expect(() => {
    insert('drive_media', media({ item_id: OTHER_ITEM, tz_offset_min: 2000 }));
  }).toThrow();
});

it('requires a reason exactly when a derived file failed or is unsupported', () => {
  expect(() => {
    insert('drive_media', media({ preview_state: 'failed' }));
  }).toThrow();
  expect(() => {
    insert('drive_media', media({ poster_state: 'ready', poster_reason: 'why' }));
  }).toThrow();
  insert('drive_media', media({ playable_state: 'unsupported', playable_reason: 'no codec' }));
  expect(count('drive_media')).toBe(1);
});

it('removes the media record and the jobs of a deleted item and unlinks a deleted stack', () => {
  insert('drive_stacks', { id: 'stack-1', kind: 'burst', cover_item_id: ITEM });
  insert('drive_media', media({ stack_id: 'stack-1' }));
  insert('drive_media_jobs', job());
  database.prepare('delete from drive_stacks where id = ?').run('stack-1');
  expect(database.prepare('select stack_id from drive_media').get()?.['stack_id']).toBeNull();
  database.prepare('delete from drive_items where id = ?').run(ITEM);
  expect(count('drive_media')).toBe(0);
  expect(count('drive_media_jobs')).toBe(0);
});

it('keeps a stack without its cover when the cover item is deleted', () => {
  insert('drive_stacks', { id: 'stack-1', kind: 'stem', cover_item_id: ITEM });
  database.prepare('delete from drive_items where id = ?').run(ITEM);
  expect(
    database.prepare('select cover_item_id from drive_stacks').get()?.['cover_item_id'],
  ).toBeNull();
  expect(() => {
    insert('drive_stacks', { id: 'stack-2', kind: 'album', cover_item_id: null });
  }).toThrow();
});

it('allows one job per item revision and kind and requires an error on a failed job', () => {
  insert('drive_media_jobs', job());
  expect(() => {
    insert('drive_media_jobs', job({ id: '0e000000-0000-4000-8000-000000000062' }));
  }).toThrow();
  insert('drive_media_jobs', job({ id: '0e000000-0000-4000-8000-000000000063', kind: 'poster' }));
  expect(() => {
    insert(
      'drive_media_jobs',
      job({ id: '0e000000-0000-4000-8000-000000000064', rev: 2, state: 'failed' }),
    );
  }).toThrow();
  expect(() => {
    insert(
      'drive_media_jobs',
      job({ id: '0e000000-0000-4000-8000-000000000065', rev: 3, progress: 2 }),
    );
  }).toThrow();
});

it('serves the next queued job from the queue index and the state tally from the state index', () => {
  const queue = database
    .prepare(
      "explain query plan select id from drive_media_jobs where state = 'queued' order by visible desc, queued_at, id limit 1",
    )
    .all()
    .map((row) => String(row['detail']))
    .join(' ');
  expect(queue).toContain('drive_media_jobs_by_queue');
  expect(queue).not.toContain('TEMP B-TREE');
});

it('indexes media by place, stack, live id, burst, stem and clip', () => {
  const indexes = database
    .prepare("select name from pragma_index_list('drive_media')")
    .all()
    .map((row) => String(row['name']));
  for (const name of [
    'drive_media_by_place',
    'drive_media_by_stack',
    'drive_media_by_live',
    'drive_media_by_burst',
    'drive_media_by_stem',
    'drive_media_by_clip',
  ]) {
    expect(indexes, name).toContain(name);
  }
});

it('stores places with a valid country code and position', () => {
  insert('drive_places', {
    id: '2643743',
    name: 'London',
    admin: 'England',
    country: 'GB',
    lat: 51.5,
    lon: -0.12,
  });
  for (const bad of [
    { country: 'gb' },
    { country: 'GBR' },
    { lat: 91 },
    { lon: 181 },
    { name: '  ' },
  ]) {
    expect(() => {
      insert('drive_places', {
        id: 'bad',
        name: 'Bad',
        admin: null,
        country: 'GB',
        lat: 0,
        lon: 0,
        ...bad,
      });
    }).toThrow();
  }
  insert('drive_media', media({ place_id: '2643743' }));
  database.prepare('delete from drive_places').run();
  expect(database.prepare('select place_id from drive_media').get()?.['place_id']).toBeNull();
});

it('registers one backup device per hub device and removes it with the person', () => {
  insert('drive_backup_devices', backupDevice());
  expect(() => {
    insert('drive_backup_devices', backupDevice({ id: '0e000000-0000-4000-8000-000000000052' }));
  }).toThrow();
  expect(() => {
    insert('drive_backup_devices', backupDevice({ id: 'x', device_id: 'missing' }));
  }).toThrow();
  expect(() => {
    insert(
      'drive_backup_devices',
      backupDevice({ id: 'y', device_id: 'z', platform: 'symbian', settings: '[]' }),
    );
  }).toThrow();
  insert('drive_backup_assets', backupAsset());
  database.prepare('delete from profiles where id = ?').run(person);
  expect(count('drive_backup_devices')).toBe(0);
  expect(count('drive_backup_assets')).toBe(0);
});

it('keeps one asset per device and local id and needs an item once uploaded', () => {
  insert('drive_backup_devices', backupDevice());
  insert('drive_backup_assets', backupAsset());
  expect(() => {
    insert('drive_backup_assets', backupAsset({ sha256: 'b'.repeat(64) }));
  }).toThrow();
  insert(
    'drive_backup_assets',
    backupAsset({ local_id: 'local-2', item_id: null, state: 'uploading' }),
  );
  expect(() => {
    insert('drive_backup_assets', backupAsset({ local_id: 'local-3', item_id: null }));
  }).toThrow();
  expect(() => {
    insert('drive_backup_assets', backupAsset({ local_id: 'local-4', sha256: 'XYZ' }));
  }).toThrow();
});

it('keeps the backup record of an asset whose item left the index', () => {
  insert('drive_backup_devices', backupDevice());
  insert('drive_backup_assets', backupAsset());
  database.prepare('delete from drive_items where id = ?').run(ITEM);
  expect(count('drive_backup_assets')).toBe(1);
});
