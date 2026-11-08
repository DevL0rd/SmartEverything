import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { DRIVE_MIGRATION } from '../../src/store/migrations/drive';
import { DRIVE_STORAGE_MIGRATION } from '../../src/store/migrations/drive-storage';
import { ProfilesRepository } from '../../src/store/repositories/profiles';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';

const NOW = '2026-11-07T00:00:00.000Z';
const LATER = '2026-11-08T00:00:00.000Z';
const ROOT = '0d000000-0000-4000-8000-000000000001';
const ITEM = '0d000000-0000-4000-8000-000000000012';
const CLIENT = '0d000000-0000-4000-8000-000000000031';
const DEVICE = '0d000000-0000-4000-8000-000000000041';
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
    MIGRATIONS.filter((migration) => migration.version < DRIVE_STORAGE_MIGRATION.version),
    NOW,
    log,
  );
  person = new ProfilesRepository(context).create({ name: 'Robin' }).id;
  migrate(context.sql, MIGRATIONS, NOW, log);
  insert('drive_roots', {
    id: ROOT,
    kind: 'folder',
    label: 'Library',
    scope: 'home',
    owner_profile_id: null,
    path: '/srv/library',
    read_only: 0,
    versions: 1,
    synced: 0,
    index_id: 'index-1',
    state: 'ready',
    items: 0,
    folders: 0,
    bytes: 0,
    hashed_share: 0,
    verified_share: 0,
    corrupt: 0,
    in_photos: 0,
    skip_patterns: '[]',
    include_hidden: 0,
    created_at: NOW,
    updated_at: NOW,
  });
  insert('drive_items', {
    id: ITEM,
    root_id: ROOT,
    rel_path: 'a.jpg',
    name: 'a.jpg',
    kind: 'image',
    mime: 'image/jpeg',
    bytes: 10,
    sha256: SHA,
    integrity: 'unknown',
    modified_at: NOW,
    added_at: NOW,
    starred: 0,
    rev: 1,
    etag: 'etag',
    outside: 0,
    thumb_state: 'none',
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

function insertClient(): void {
  insert('clients', {
    id: CLIENT,
    name: 'Phone',
    platform: 'android',
    role: 'member',
    token_hash: 'client-hash',
    created_at: NOW,
  });
}

function insertNode(): void {
  insert('devices', {
    id: DEVICE,
    provider: 'local',
    external_id: 'computer:aa',
    kind: 'computer',
    name: 'Desk',
    model: 'm',
    manufacturer: 'v',
    created_at: NOW,
    updated_at: NOW,
  });
  insert('computer_nodes', {
    device_id: DEVICE,
    machine_id: 'b'.repeat(32),
    token_hash: 'node-hash',
    hub_url: 'http://h',
    paired_at: NOW,
  });
}

function version(fields: Fields = {}): Fields {
  return {
    id: '0d000000-0000-4000-8000-000000000051',
    root_id: ROOT,
    item_id: ITEM,
    rev: 1,
    sha256: SHA,
    bytes: 10,
    at: NOW,
    purge_at: LATER,
    actor_profile_id: person,
    via: 'app',
    device_id: null,
    added_by_profile_id: person,
    ...fields,
  };
}

function upload(fields: Fields = {}): Fields {
  return {
    id: '0d000000-0000-4000-8000-000000000061',
    root_id: ROOT,
    target_kind: 'folder',
    target_id: ITEM,
    base_rev: null,
    name: 'b.jpg',
    length: 100,
    offset: 0,
    state: 'open',
    failure_reason: null,
    profile_id: person,
    client_id: CLIENT,
    node_id: null,
    created_at: NOW,
    expires_at: LATER,
    ...fields,
  };
}

function intent(fields: Fields = {}): Fields {
  return {
    id: '0d000000-0000-4000-8000-000000000071',
    root_id: ROOT,
    op: 'commit',
    from_path: '.smarteverything/tmp/x',
    to_path: 'a.jpg',
    version_path: '.smarteverything/versions/aa/x',
    at: NOW,
    ...fields,
  };
}

it('registers migration B directly after migration A', () => {
  expect(DRIVE_STORAGE_MIGRATION.version).toBe(DRIVE_MIGRATION.version + 1);
  const versions = MIGRATIONS.map((migration) => migration.version);
  expect(versions.indexOf(DRIVE_STORAGE_MIGRATION.version)).toBe(
    versions.indexOf(DRIVE_MIGRATION.version) + 1,
  );
});

it('creates every storage table as a strict table', () => {
  const tables = database
    .prepare("select name, strict from pragma_table_list where name like 'drive\\_%' escape '\\'")
    .all();
  const strictOf = new Map(tables.map((table) => [table['name'], table['strict']]));
  for (const name of [
    'drive_versions',
    'drive_shares',
    'drive_share_events',
    'drive_uploads',
    'drive_quotas',
    'drive_scrub',
    'drive_intents',
    'drive_blocks',
    'drive_sync_clients',
    'drive_sync_ops',
    'drive_backups',
  ]) {
    expect(strictOf.get(name), name).toBe(1);
  }
});

it('seeds the drive settings row once with the first values', () => {
  const rows = database.prepare("select settings from ai_settings where key = 'drive'").all();
  expect(rows).toHaveLength(1);
  expect(JSON.parse(String(rows[0]?.['settings']))).toEqual({
    uploadExpiryDays: 7,
    membersMayShare: false,
    duplicatesHashing: true,
    indexingPaused: false,
  });
});

it('stores versions with the adding profile, one per item revision, and indexes the purge and content lookups', () => {
  insert('drive_versions', version());
  expect(() => {
    insert('drive_versions', version({ id: '0d000000-0000-4000-8000-000000000052' }));
  }).toThrow();
  expect(() => {
    insert(
      'drive_versions',
      version({ id: '0d000000-0000-4000-8000-000000000053', rev: 2, purge_at: NOW }),
    );
  }).toThrow();
  expect(() => {
    insert(
      'drive_versions',
      version({ id: '0d000000-0000-4000-8000-000000000054', rev: 3, sha256: 'xyz' }),
    );
  }).toThrow();
  expect(() => {
    insert(
      'drive_versions',
      version({ id: '0d000000-0000-4000-8000-000000000055', rev: 4, via: 'other' }),
    );
  }).toThrow();
  const indexes = database
    .prepare("select name from pragma_index_list('drive_versions') where origin = 'c'")
    .all()
    .map((index) => index['name']);
  expect(indexes.sort()).toEqual([
    'drive_versions_by_adder',
    'drive_versions_by_content',
    'drive_versions_by_purge',
  ]);
  database.prepare('delete from profiles where id = ?').run(person);
  expect(database.prepare('select added_by_profile_id as adder from drive_versions').get()).toEqual(
    {
      adder: null,
    },
  );
});

it('keeps a version after its item row goes and removes it with its root', () => {
  insert('drive_versions', version());
  database.prepare('delete from drive_items where id = ?').run(ITEM);
  expect(database.prepare('select count(*) as n from drive_versions').get()).toEqual({ n: 1 });
  database.prepare('delete from drive_roots where id = ?').run(ROOT);
  expect(database.prepare('select count(*) as n from drive_versions').get()).toEqual({ n: 0 });
});

it('keeps share tokens unique by hash and removes events with the share', () => {
  const share = (id: string, hash: string): Fields => ({
    id,
    item_id: ITEM,
    token_hash: hash,
    permission: 'view',
    created_by: person,
    created_at: NOW,
    opens: 0,
    downloads: 0,
  });
  insert('drive_shares', share('0d000000-0000-4000-8000-000000000081', 'h1'));
  expect(() => {
    insert('drive_shares', share('0d000000-0000-4000-8000-000000000082', 'h1'));
  }).toThrow();
  expect(() => {
    insert('drive_shares', {
      ...share('0d000000-0000-4000-8000-000000000083', 'h2'),
      permission: 'edit',
    });
  }).toThrow();
  insert('drive_share_events', {
    share_id: '0d000000-0000-4000-8000-000000000081',
    kind: 'open',
    at: NOW,
  });
  expect(() => {
    insert('drive_share_events', {
      share_id: '0d000000-0000-4000-8000-000000000081',
      kind: 'edit',
      at: NOW,
    });
  }).toThrow();
  database.prepare('delete from drive_shares').run();
  expect(database.prepare('select count(*) as n from drive_share_events').get()).toEqual({ n: 0 });
});

it('ties an upload to its profile and to exactly one client or one computer node', () => {
  insertClient();
  insertNode();
  insert('drive_uploads', upload());
  insert(
    'drive_uploads',
    upload({
      id: '0d000000-0000-4000-8000-000000000062',
      client_id: null,
      node_id: DEVICE,
    }),
  );
  expect(() => {
    insert(
      'drive_uploads',
      upload({ id: '0d000000-0000-4000-8000-000000000063', node_id: DEVICE }),
    );
  }).toThrow();
  expect(() => {
    insert(
      'drive_uploads',
      upload({ id: '0d000000-0000-4000-8000-000000000064', client_id: null, node_id: null }),
    );
  }).toThrow();
  expect(() => {
    insert(
      'drive_uploads',
      upload({ id: '0d000000-0000-4000-8000-000000000065', profile_id: null }),
    );
  }).toThrow();
});

it('refuses uploads that pass their length, expire before creation, mismatch their target or carry a wrong failure reason', () => {
  insertClient();
  const next = (suffix: number, fields: Fields): Fields =>
    upload({ id: `0d000000-0000-4000-8000-0000000001${String(suffix)}`, ...fields });
  expect(() => {
    insert('drive_uploads', next(10, { offset: 101 }));
  }).toThrow();
  expect(() => {
    insert('drive_uploads', next(11, { expires_at: NOW }));
  }).toThrow();
  expect(() => {
    insert('drive_uploads', next(12, { target_kind: 'item' }));
  }).toThrow();
  expect(() => {
    insert('drive_uploads', next(13, { base_rev: 1 }));
  }).toThrow();
  expect(() => {
    insert('drive_uploads', next(14, { state: 'failed' }));
  }).toThrow();
  expect(() => {
    insert('drive_uploads', next(15, { failure_reason: 'disk full' }));
  }).toThrow();
  insert('drive_uploads', next(16, { state: 'failed', failure_reason: 'disk full' }));
  insert('drive_uploads', next(17, { target_kind: 'item', base_rev: 2 }));
});

it('stores one quota per profile and drops it with the profile', () => {
  insert('drive_quotas', { profile_id: person, bytes: 1000 });
  expect(() => {
    insert('drive_quotas', { profile_id: person, bytes: 2000 });
  }).toThrow();
  expect(() => {
    insert('drive_quotas', { profile_id: '0d000000-0000-4000-8000-0000000000ff', bytes: 1 });
  }).toThrow();
  database.prepare('delete from profiles where id = ?').run(person);
  expect(database.prepare('select count(*) as n from drive_quotas').get()).toEqual({ n: 0 });
});

it('records one scrub result per item and block hashes per item revision, both dropped with the item', () => {
  insert('drive_scrub', { item_id: ITEM, root_id: ROOT, verified_at: NOW, result: 'ok' });
  expect(() => {
    insert('drive_scrub', { item_id: ITEM, root_id: ROOT, verified_at: NOW, result: 'corrupt' });
  }).toThrow();
  expect(() => {
    database.prepare("update drive_scrub set result = 'maybe'").run();
  }).toThrow();
  insert('drive_blocks', {
    item_id: ITEM,
    rev: 1,
    block_size: 131072,
    hashes: new Uint8Array(32),
  });
  expect(() => {
    insert('drive_blocks', {
      item_id: ITEM,
      rev: 1,
      block_size: 131072,
      hashes: new Uint8Array(32),
    });
  }).toThrow();
  expect(() => {
    insert('drive_blocks', { item_id: ITEM, rev: 2, block_size: 0, hashes: new Uint8Array(32) });
  }).toThrow();
  database.prepare('delete from drive_items where id = ?').run(ITEM);
  expect(database.prepare('select count(*) as n from drive_scrub').get()).toEqual({ n: 0 });
  expect(database.prepare('select count(*) as n from drive_blocks').get()).toEqual({ n: 0 });
});

it('journals trash, restore, version and commit intents and allows a version path only on the last two', () => {
  insert('drive_intents', intent());
  insert(
    'drive_intents',
    intent({ id: '0d000000-0000-4000-8000-000000000072', op: 'commit', version_path: null }),
  );
  insert(
    'drive_intents',
    intent({ id: '0d000000-0000-4000-8000-000000000073', op: 'version', from_path: 'a.jpg' }),
  );
  insert(
    'drive_intents',
    intent({
      id: '0d000000-0000-4000-8000-000000000074',
      op: 'trash',
      version_path: null,
    }),
  );
  expect(() => {
    insert('drive_intents', intent({ id: '0d000000-0000-4000-8000-000000000075', op: 'trash' }));
  }).toThrow();
  expect(() => {
    insert('drive_intents', intent({ id: '0d000000-0000-4000-8000-000000000076', op: 'delete' }));
  }).toThrow();
  expect(() => {
    insert('drive_intents', intent({ id: '0d000000-0000-4000-8000-000000000077', to_path: '' }));
  }).toThrow();
});

it('keeps one sync row per client and root and remembers op ids per client', () => {
  insertClient();
  insertNode();
  const sync = (fields: Fields = {}): Fields => ({
    client_id: CLIENT,
    root_id: ROOT,
    device_id: DEVICE,
    profile_id: person,
    enabled: 1,
    selected: '[]',
    last_seq: 0,
    last_seen_at: null,
    need_bytes: 0,
    errors: '[]',
    ...fields,
  });
  insert('drive_sync_clients', sync());
  expect(() => {
    insert('drive_sync_clients', sync());
  }).toThrow();
  expect(() => {
    insert('drive_sync_clients', sync({ selected: '{}' }));
  }).toThrow();
  insert('drive_sync_ops', { client_id: CLIENT, op_id: 'op-1', result: '{"ok":true}', at: NOW });
  expect(() => {
    insert('drive_sync_ops', { client_id: CLIENT, op_id: 'op-1', result: '{}', at: NOW });
  }).toThrow();
  expect(() => {
    insert('drive_sync_ops', { client_id: CLIENT, op_id: 'op-2', result: '[]', at: NOW });
  }).toThrow();
  database.prepare('delete from clients where id = ?').run(CLIENT);
  expect(database.prepare('select count(*) as n from drive_sync_clients').get()).toEqual({ n: 0 });
  expect(database.prepare('select count(*) as n from drive_sync_ops').get()).toEqual({ n: 0 });
});

it('records backup reports with a reporter and a boolean outcome', () => {
  insert('drive_backups', { at: NOW, reporter: 'nas-box', bytes: 5, ok: 1 });
  expect(() => {
    insert('drive_backups', { at: NOW, reporter: '', bytes: 5, ok: 1 });
  }).toThrow();
  expect(() => {
    insert('drive_backups', { at: NOW, reporter: 'nas-box', bytes: 5, ok: 2 });
  }).toThrow();
  expect(database.prepare('select count(*) as n from drive_backups').get()).toEqual({ n: 1 });
});
