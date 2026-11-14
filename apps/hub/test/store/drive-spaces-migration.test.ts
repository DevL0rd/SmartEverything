import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { DRIVE_SPACES_MIGRATION } from '../../src/store/migrations/drive-spaces';
import { ProfilesRepository } from '../../src/store/repositories/profiles';
import { Sql, SQL_JSON } from '../../src/store/sql';
import { testLogger } from '../support/logs';

const NOW = '2026-11-07T00:00:00.000Z';
const LATER = '2026-11-08T00:00:00.000Z';
const SHA = 'a'.repeat(64);

const id = (group: string, index: number): string =>
  `${group}000000-0000-4000-8000-${String(index).padStart(12, '0')}`;

const SHARED = id('0a', 1);
const ROBIN_ROOT = id('0a', 2);
const SAM_ROOT = id('0a', 3);
const LINKED = id('0a', 4);
const CAMERAS = id('0a', 5);
const LINKED_ROOTS = [LINKED, CAMERAS];

const DOCS = id('0b', 1);
const SUB = id('0b', 2);
const MID = id('0b', 3);
const OTHER = id('0b', 4);
const NOTE = id('0b', 5);
const PHOTO = id('0b', 6);
const DEEP = id('0b', 7);
const SAM_FOLDER = id('0b', 8);
const SAM_FILE = id('0b', 9);
const LINKED_FOLDER = id('0b', 20);
const LINKED_PHOTO = id('0b', 21);
const LINKED_ITEMS = [LINKED_FOLDER, LINKED_PHOTO];
const TRASHED = id('0b', 30);
const LINKED_TRASHED = id('0b', 31);

const DEVICE_ONE = id('0c', 1);
const DEVICE_TWO = id('0c', 2);
const CLIENT_OLD = id('0c', 11);
const CLIENT_NEW = id('0c', 12);
const CLIENT_LINKED = id('0c', 13);

const P_SYNCED = id('0d', 1);
const P_SHARED = id('0d', 2);
const P_FOLDER = id('0d', 3);
const P_LINKED = id('0d', 4);

const ALBUM = id('0e', 1);
const STACK = id('0e', 2);

type Fields = Record<string, string | number | null | Uint8Array>;

let database: DatabaseSync;
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

function count(text: string): number {
  return z
    .object({ n: z.number() })
    .parse(database.prepare(`select count(*) as n from ${text}`).get()).n;
}

function rows<T extends z.ZodType>(schema: T, text: string): z.output<T>[] {
  return z.array(schema).parse(database.prepare(text).all());
}

function root(rootId: string, fields: Fields): void {
  insert('drive_roots', {
    id: rootId,
    kind: 'managed',
    label: rootId,
    scope: 'home',
    owner_profile_id: null,
    path: `/data/${rootId}`,
    read_only: 0,
    versions: 1,
    synced: 0,
    index_id: `index-${rootId}`,
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
    ...fields,
  });
}

function item(itemId: string, rootId: string, relPath: string, fields: Fields = {}): void {
  const folder = fields['kind'] === 'folder';
  insert('drive_items', {
    id: itemId,
    root_id: rootId,
    parent_id: null,
    rel_path: relPath,
    name: relPath.split('/').at(-1) ?? relPath,
    kind: 'document',
    mime: folder ? null : 'text/plain',
    bytes: 10,
    child_count: folder ? 0 : null,
    integrity: 'unknown',
    modified_at: NOW,
    added_at: NOW,
    starred: 0,
    rev: 1,
    etag: 'etag',
    outside: 0,
    thumb_state: 'none',
    ...fields,
  });
}

function folder(itemId: string, rootId: string, relPath: string, parent: string | null): void {
  item(itemId, rootId, relPath, { kind: 'folder', parent_id: parent });
}

function image(itemId: string, rootId: string, relPath: string, fields: Fields = {}): void {
  item(itemId, rootId, relPath, { kind: 'image', mime: 'image/jpeg', ...fields });
}

function device(deviceId: string, externalId: string): void {
  insert('devices', {
    id: deviceId,
    provider: 'local',
    external_id: externalId,
    kind: 'computer',
    name: externalId,
    model: 'm',
    manufacturer: 'v',
    created_at: NOW,
    updated_at: NOW,
  });
}

function client(clientId: string): void {
  insert('clients', {
    id: clientId,
    name: clientId,
    platform: 'desktop',
    role: 'member',
    token_hash: clientId,
    created_at: NOW,
  });
}

function placement(placementId: string, rootId: string, fields: Fields): void {
  insert('drive_placements', {
    id: placementId,
    device_id: DEVICE_ONE,
    root_id: rootId,
    folder_item_id: null,
    mode: 'mounted',
    local_path: `/mnt/${placementId}`,
    enabled: 1,
    hold: null,
    created_by: robin,
    created_at: NOW,
    state: 'up_to_date',
    tier: null,
    basic_limits: null,
    read_only: 0,
    route: null,
    cache_bytes: 0,
    pinned_bytes: 0,
    open_files: 0,
    pending_uploads: 0,
    reason: null,
    reported_at: NOW,
    ...fields,
  });
}

function syncClient(clientId: string, rootId: string, deviceId: string, fields: Fields): void {
  insert('drive_sync_clients', {
    client_id: clientId,
    root_id: rootId,
    device_id: deviceId,
    profile_id: robin,
    enabled: 1,
    selected: '[]',
    last_seq: 0,
    last_seen_at: null,
    need_bytes: 0,
    errors: '[]',
    ...fields,
  });
}

function childRows(rootId: string, trashed: string, itemIds: readonly string[]): void {
  const [first = ''] = itemIds;
  insert('drive_trash', {
    item_id: trashed,
    root_id: rootId,
    name: 'old.txt',
    original_rel_path: 'old.txt',
    trash_rel_path: `.smarteverything/trash/${trashed}`,
    is_folder: 0,
    bytes: 5,
    deleted_at: NOW,
    purge_at: LATER,
  });
  insert('drive_versions', {
    id: id('1a', Number(trashed.slice(-4))),
    root_id: rootId,
    item_id: first,
    rev: 1,
    sha256: SHA,
    bytes: 10,
    at: NOW,
    purge_at: LATER,
    via: 'app',
  });
  insert('drive_feed', {
    root_id: rootId,
    item_id: first,
    op: 'create',
    rev: 1,
    at: NOW,
    via: 'app',
    actor_profile_id: robin,
  });
  insert('drive_days', {
    day: '2026-11-07',
    root_id: rootId,
    items: 1,
    bytes: 10,
    added: 1,
    removed: 0,
  });
  insert('drive_intents', {
    id: id('1b', Number(trashed.slice(-4))),
    root_id: rootId,
    op: 'trash',
    from_path: 'a',
    to_path: 'b',
    at: NOW,
  });
  insert('drive_scrub', { item_id: first, root_id: rootId, verified_at: NOW, result: 'ok' });
  insert('drive_blocks', {
    item_id: first,
    rev: 1,
    block_size: 4096,
    hashes: new Uint8Array(32),
  });
  insert('drive_photo_library', { item_id: first, root_id: rootId });
  insert('drive_photo_old_folders', { item_id: first });
  insert('drive_photo_relocations', { item_id: first, from_path: 'Camera roll/a.jpg' });
  insert('drive_photo_trash_folders', { item_id: trashed });
  insert('drive_media', {
    item_id: first,
    time_source: 'metadata',
    preview_state: 'none',
    poster_state: 'none',
    playable_state: 'none',
  });
  insert('drive_media_jobs', {
    id: id('1c', Number(trashed.slice(-4))),
    kind: 'thumb',
    item_id: first,
    rev: 1,
    state: 'queued',
    visible: 0,
    attempts: 0,
    queued_at: NOW,
  });
  const share = id('1d', Number(trashed.slice(-4)));
  insert('drive_shares', {
    id: share,
    item_id: first,
    token_hash: `hash-${share}`,
    permission: 'view',
    created_by: robin,
    created_at: NOW,
    opens: 0,
    downloads: 0,
  });
  insert('drive_share_events', { share_id: share, kind: 'open', at: NOW });
  const upload = id('1e', Number(trashed.slice(-4)));
  insert('drive_uploads', {
    id: upload,
    root_id: rootId,
    target_kind: 'folder',
    target_id: first,
    name: 'u.bin',
    length: 10,
    offset: 0,
    state: 'open',
    profile_id: robin,
    client_id: CLIENT_OLD,
    created_at: NOW,
    expires_at: LATER,
  });
  insert('drive_upload_results', { upload_id: upload, item_id: first, name: 'u.bin' });
  insert('drive_conflicts', {
    id: id('1f', Number(trashed.slice(-4))),
    root_id: rootId,
    item_id: first,
    conflict_item_id: itemIds[1] ?? first,
    rel_path: 'a',
    conflict_rel_path: 'a (conflict)',
    hub_rev: 1,
    base_rev: 1,
    device_id: 'laptop',
    at: NOW,
  });
  insert('drive_items_search', {
    item_id: first,
    name: 'n',
    path: 'p',
    camera: '',
    albums: '',
    dates: '',
  });
}

interface Selector {
  readonly roots: string;
  readonly items: string;
  readonly trashed: string;
}

const MANAGED_ITEMS = [PHOTO, NOTE];

const CHILD_TABLES: readonly {
  readonly table: string;
  readonly where: (ids: Selector) => string;
}[] = [
  { table: 'drive_items', where: (c) => `root_id in ${c.roots}` },
  { table: 'drive_trash', where: (c) => `root_id in ${c.roots}` },
  { table: 'drive_versions', where: (c) => `root_id in ${c.roots}` },
  { table: 'drive_feed', where: (c) => `root_id in ${c.roots}` },
  { table: 'drive_days', where: (c) => `root_id in ${c.roots}` },
  { table: 'drive_intents', where: (c) => `root_id in ${c.roots}` },
  { table: 'drive_scrub', where: (c) => `root_id in ${c.roots}` },
  { table: 'drive_conflicts', where: (c) => `root_id in ${c.roots}` },
  { table: 'drive_uploads', where: (c) => `root_id in ${c.roots}` },
  { table: 'drive_photo_library', where: (c) => `root_id in ${c.roots}` },
  { table: 'drive_blocks', where: (c) => `item_id in ${c.items}` },
  { table: 'drive_media', where: (c) => `item_id in ${c.items}` },
  { table: 'drive_media_jobs', where: (c) => `item_id in ${c.items}` },
  { table: 'drive_shares', where: (c) => `item_id in ${c.items}` },
  { table: 'drive_album_items', where: (c) => `item_id in ${c.items}` },
  { table: 'drive_photo_old_folders', where: (c) => `item_id in ${c.items}` },
  { table: 'drive_photo_relocations', where: (c) => `item_id in ${c.items}` },
  { table: 'drive_photo_trash_folders', where: (c) => `item_id in ${c.trashed}` },
  { table: 'drive_items_search', where: (c) => `item_id in ${c.items}` },
];

const list = (values: readonly string[]): string =>
  `(${values.map((value) => `'${value}'`).join(', ')})`;

const MANAGED: Selector = {
  roots: list([SHARED, ROBIN_ROOT, SAM_ROOT]),
  items: list([...MANAGED_ITEMS, DOCS, SAM_FILE]),
  trashed: list([TRASHED]),
};

const LINKED_IDS: Selector = {
  roots: list(LINKED_ROOTS),
  items: list(LINKED_ITEMS),
  trashed: list([LINKED_TRASHED]),
};

function countsOf(selector: Selector): Record<string, number> {
  return Object.fromEntries(
    CHILD_TABLES.map((entry) => [
      entry.table,
      count(`${entry.table} where ${entry.where(selector)}`),
    ]),
  );
}

beforeEach(() => {
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const log = testLogger();
  const context = new StoreContext(new Sql(database), new ChangeFeed(log), () => new Date(NOW));
  migrate(
    context.sql,
    MIGRATIONS.filter((migration) => migration.version < DRIVE_SPACES_MIGRATION.version),
    NOW,
    log,
  );
  const profiles = new ProfilesRepository(context);
  robin = profiles.create({ name: 'Robin' }).id;
  sam = profiles.create({ name: 'Sam' }).id;
  seed();
});

afterEach(() => {
  database.close();
});

function seed(): void {
  device(DEVICE_ONE, 'computer:one');
  device(DEVICE_TWO, 'computer:two');
  for (const clientId of [CLIENT_OLD, CLIENT_NEW, CLIENT_LINKED]) client(clientId);
  root(SHARED, { scope: 'home', label: 'Shared', path: '/data/home/drive' });
  root(ROBIN_ROOT, {
    scope: 'person',
    owner_profile_id: robin,
    label: 'Robin',
    path: '/data/robin/drive',
    in_photos: 1,
    synced: 1,
    sync: '{"ignorePatterns":["*.tmp"],"conflictCopies":false,"clients":[]}',
    items: 7,
    bytes: 70,
  });
  root(SAM_ROOT, {
    scope: 'person',
    owner_profile_id: sam,
    label: 'Sam',
    path: '/data/sam/drive',
    state: 'offline',
    state_reason: 'unplugged',
  });
  root(LINKED, {
    kind: 'folder',
    scope: 'home',
    label: 'Library',
    path: '/mnt/library',
    read_only: 1,
    versions: 0,
  });
  root(CAMERAS, {
    kind: 'cameras',
    scope: 'home',
    label: 'Cameras',
    path: null,
    read_only: 1,
    versions: 0,
    in_photos: 1,
  });
  folder(DOCS, ROBIN_ROOT, 'Docs', null);
  folder(SUB, ROBIN_ROOT, 'Docs/Sub', DOCS);
  folder(MID, ROBIN_ROOT, 'Docs/Mid', DOCS);
  folder(OTHER, ROBIN_ROOT, 'Other', null);
  item(DEEP, ROBIN_ROOT, 'Docs/Sub/x.txt', { parent_id: SUB, starred: 1 });
  image(PHOTO, ROBIN_ROOT, 'Photos/a.jpg');
  item(NOTE, SHARED, 'note.txt', { starred: 1 });
  folder(SAM_FOLDER, SAM_ROOT, 'Mine', null);
  item(SAM_FILE, SAM_ROOT, 'Mine/b.txt', { parent_id: SAM_FOLDER });
  folder(LINKED_FOLDER, LINKED, 'Movies', null);
  image(LINKED_PHOTO, LINKED, 'Movies/p.jpg', { parent_id: LINKED_FOLDER, starred: 1 });
  childRows(ROBIN_ROOT, TRASHED, [DOCS, SUB]);
  childRows(SAM_ROOT, id('0b', 32), [SAM_FILE, SAM_FOLDER]);
  childRows(LINKED, LINKED_TRASHED, [LINKED_PHOTO, LINKED_FOLDER]);
  insert('drive_stacks', { id: STACK, kind: 'burst', cover_item_id: LINKED_PHOTO });
  database
    .prepare('update drive_media set stack_id = ? where item_id = ?')
    .run(STACK, LINKED_PHOTO);
  insert('drive_albums', {
    id: ALBUM,
    title: 'Mixed',
    kind: 'manual',
    surface: 'photos',
    scope: 'home',
    owner_profile_id: null,
    cover_item_id: LINKED_PHOTO,
    item_count: 3,
    created_at: NOW,
    updated_at: NOW,
  });
  for (const [position, itemId] of [PHOTO, LINKED_PHOTO, DEEP].entries()) {
    insert('drive_album_items', { album_id: ALBUM, item_id: itemId, position, added_at: NOW });
  }
  placement(P_SYNCED, ROBIN_ROOT, {
    mode: 'synced',
    local_path: '/home/robin/Drive',
  });
  placement(P_SHARED, SHARED, { device_id: DEVICE_TWO });
  placement(P_FOLDER, SAM_ROOT, { folder_item_id: SAM_FOLDER, created_by: sam });
  placement(P_LINKED, LINKED, { device_id: DEVICE_TWO });
  syncClient(CLIENT_OLD, ROBIN_ROOT, DEVICE_ONE, {
    selected: '["Docs/Sub"]',
    need_bytes: 1,
    last_seen_at: NOW,
  });
  syncClient(CLIENT_NEW, ROBIN_ROOT, DEVICE_ONE, {
    selected: '["Docs/Sub"]',
    need_bytes: 42,
    last_seen_at: LATER,
    errors: JSON.stringify([{ relPath: 'a', message: 'disk full', at: LATER }]),
  });
  syncClient(CLIENT_LINKED, LINKED, DEVICE_TWO, {});
  insert('drive_sync_ops', { client_id: CLIENT_OLD, op_id: 'op-1', result: '{}', at: NOW });
}

function migrateAll(): void {
  const log = testLogger();
  migrate(new Sql(database), MIGRATIONS, NOW, log);
}

describe('migration 202', () => {
  it('is the only migration numbered 202, runs after every lower one and before every higher one', () => {
    expect(DRIVE_SPACES_MIGRATION.version).toBe(202);
    expect(DRIVE_SPACES_MIGRATION.foreignKeys).toBe('off');
    const versions = MIGRATIONS.map((migration) => migration.version);
    expect(versions.filter((version) => version === 202)).toHaveLength(1);
    const position = versions.indexOf(202);
    expect(Math.max(...versions.slice(0, position + 1))).toBe(202);
    expect(Math.min(...versions.slice(position))).toBe(202);
    expect(versions.slice(position + 1).every((version) => version > 202)).toBe(true);
  });

  it('keeps every row of the personal drives and the Shared Drive in every child table', () => {
    const before = countsOf(MANAGED);
    expect(Object.values(before).every((value) => value > 0)).toBe(true);
    const linkedBefore = countsOf(LINKED_IDS);
    expect(Object.values(linkedBefore).every((value) => value > 0)).toBe(true);
    migrateAll();
    expect(countsOf(MANAGED)).toEqual({
      ...before,
      drive_photo_library: (before['drive_photo_library'] ?? 0) + 1,
    });
    expect(countsOf(LINKED_IDS)).toEqual(
      Object.fromEntries(Object.keys(linkedBefore).map((table) => [table, 0])),
    );
    expect(count(`drive_share_events where share_id in (select id from drive_shares)`)).toBe(
      count('drive_share_events'),
    );
    expect(count('drive_upload_results')).toBe(2);
    expect(count('drive_roots')).toBe(3);
    expect(
      rows(z.object({ id: z.string() }), 'select id from drive_roots order by id').map(
        (row) => row.id,
      ),
    ).toEqual([SHARED, ROBIN_ROOT, SAM_ROOT]);
  });

  it('leaves no row pointing at a missing drive or item', () => {
    migrateAll();
    expect(rows(z.object({ table: z.string() }), 'pragma foreign_key_check')).toEqual([]);
  });

  it('rebuilds drive_roots without the linked columns and maps the offline state', () => {
    migrateAll();
    const columns = rows(
      z.object({ name: z.string() }),
      "select name from pragma_table_info('drive_roots')",
    ).map((row) => row.name);
    expect(columns).toEqual([
      'id',
      'scope',
      'owner_profile_id',
      'versions',
      'index_id',
      'state',
      'state_reason',
      'items',
      'folders',
      'bytes',
      'scanned_at',
      'hashed_share',
      'verified_share',
      'corrupt',
      'last_scrub_at',
      'last_backup_at',
      'skip_patterns',
      'include_hidden',
      'created_at',
      'updated_at',
    ]);
    expect(
      rows(
        z.object({ state: z.string(), state_reason: z.string() }),
        `select state, state_reason from drive_roots where id = '${SAM_ROOT}'`,
      ),
    ).toEqual([{ state: 'error', state_reason: 'unplugged' }]);
    expect(
      rows(
        z.object({ items: z.number(), bytes: z.number() }),
        `select items, bytes from drive_roots where id = '${ROBIN_ROOT}'`,
      ),
    ).toEqual([{ items: 7, bytes: 70 }]);
  });

  it('allows one shared drive and one drive per person afterwards', () => {
    migrateAll();
    expect(() => {
      root(id('0a', 9), {});
    }).toThrow();
    const shared = database.prepare(
      `insert into drive_roots (id, scope, owner_profile_id, versions, index_id, state, items,
        folders, bytes, hashed_share, verified_share, corrupt, skip_patterns, include_hidden,
        created_at, updated_at)
        values (?, ?, ?, 1, 'i', 'ready', 0, 0, 0, 0, 0, 0, '[]', 0, ?, ?)`,
    );
    expect(() => shared.run(id('0a', 9), 'home', null, NOW, NOW)).toThrow();
    expect(() => shared.run(id('0a', 10), 'person', robin, NOW, NOW)).toThrow();
    expect(() => shared.run(id('0a', 11), 'person', null, NOW, NOW)).toThrow();
  });

  it('starts every carried-over drive with file history off', () => {
    migrateAll();
    const flags = rows(z.object({ versions: z.number() }), 'select versions from drive_roots');
    expect(flags.length).toBeGreaterThan(0);
    expect(flags.every((row) => row.versions === 0)).toBe(true);
  });

  it('records the linked folders for the one-time file cleanup', () => {
    migrateAll();
    expect(
      rows(
        z.object({ root_id: z.string(), path: z.string(), read_only: z.number() }),
        'select root_id, path, read_only from drive_unlinked_folders',
      ),
    ).toEqual([{ root_id: LINKED, path: '/mnt/library', read_only: 1 }]);
  });

  it('keeps Photos membership and adds the media of a drive that was in Photos', () => {
    const libraryBefore = count(`drive_photo_library where root_id in ${MANAGED.roots}`);
    migrateAll();
    const members = rows(
      z.object({ item_id: z.string() }),
      'select item_id from drive_photo_library',
    ).map((row) => row.item_id);
    expect(members).toContain(PHOTO);
    expect(members).not.toContain(LINKED_PHOTO);
    expect(members).not.toContain(DEEP);
    expect(count(`drive_photo_library where root_id in ${MANAGED.roots}`)).toBe(libraryBefore + 1);
  });

  it('moves every star into drive_stars per person and drops the column and its index', () => {
    migrateAll();
    const stars = rows(
      z.object({ profile_id: z.string(), item_id: z.string() }),
      'select profile_id, item_id from drive_stars order by profile_id, item_id',
    );
    const everyone = count('profiles');
    expect(stars).toHaveLength(1 + everyone);
    expect(stars).toContainEqual({ profile_id: robin, item_id: DEEP });
    expect(stars.filter((star) => star.item_id === NOTE)).toHaveLength(everyone);
    expect(everyone).toBeGreaterThan(2);
    const itemColumns = rows(
      z.object({ name: z.string() }),
      "select name from pragma_table_info('drive_items')",
    ).map((row) => row.name);
    expect(itemColumns).not.toContain('starred');
    expect(count("sqlite_master where name = 'drive_items_by_starred'")).toBe(0);
  });

  it('creates an empty grants table that refuses a grant to oneself', () => {
    migrateAll();
    expect(count('drive_grants')).toBe(0);
    const grant = (profile: string, grantedBy: string): void => {
      insert('drive_grants', {
        id: id('2a', 1),
        item_id: DOCS,
        profile_id: profile,
        role: 'view',
        granted_by: grantedBy,
        created_at: NOW,
      });
    };
    expect(() => {
      grant(robin, robin);
    }).toThrow();
    grant(sam, robin);
    expect(count('drive_grants')).toBe(1);
  });

  describe('placements', () => {
    const PLACEMENT_ROW = z.object({
      id: z.string(),
      mode: z.string(),
      excluded: z.string().nullable(),
      ignore_patterns: z.string().nullable(),
      conflict_copies: z.number().nullable(),
      need_bytes: z.number(),
      last_synced_at: z.string().nullable(),
      errors: z.string(),
      folder_item_id: z.string().nullable(),
    });
    const texts = (text: string | null | undefined): string[] =>
      z.array(z.string()).parse(SQL_JSON.parse(text ?? 'null'));

    function migratedPlacements(): z.output<typeof PLACEMENT_ROW>[] {
      migrateAll();
      return rows(
        PLACEMENT_ROW,
        `select id, mode, excluded, ignore_patterns, conflict_copies, need_bytes, last_synced_at,
          errors, folder_item_id from drive_placements order by id`,
      );
    }

    it('keeps the placements of managed drives and drops the linked one', () => {
      const placements = migratedPlacements();
      expect(placements.map((row) => row.id)).toEqual([P_SYNCED, P_SHARED, P_FOLDER]);
      expect(placements[2]?.folder_item_id).toBe(SAM_FOLDER);
    });

    it('moves the sync settings and the latest client report onto the synced placement', () => {
      const synced = migratedPlacements()[0];
      expect(synced?.mode).toBe('synced');
      expect(texts(synced?.excluded).toSorted()).toEqual(['Docs/Mid', 'Other']);
      expect(texts(synced?.ignore_patterns)).toEqual(['*.tmp']);
      expect(synced?.conflict_copies).toBe(0);
      expect(synced?.need_bytes).toBe(42);
      expect(synced?.last_synced_at).toBe(LATER);
      expect(synced?.errors).toBe(
        JSON.stringify([{ relPath: 'a', message: 'disk full', at: LATER }]),
      );
    });

    it('gives mounted placements no sync settings', () => {
      for (const mounted of migratedPlacements().slice(1)) {
        expect(mounted).toMatchObject({
          mode: 'mounted',
          excluded: null,
          ignore_patterns: null,
          conflict_copies: null,
          need_bytes: 0,
          last_synced_at: null,
          errors: '[]',
        });
      }
    });
  });

  it('drops sync clients and re-keys sync operations by placement', () => {
    migrateAll();
    expect(count("sqlite_master where name = 'drive_sync_clients'")).toBe(0);
    expect(count('drive_sync_ops')).toBe(0);
    const columns = rows(
      z.object({ name: z.string() }),
      "select name from pragma_table_info('drive_sync_ops')",
    ).map((row) => row.name);
    expect(columns).toEqual(['placement_id', 'op_id', 'result', 'at']);
    insert('drive_sync_ops', { placement_id: P_SYNCED, op_id: 'a', result: '{}', at: NOW });
    expect(count('drive_sync_ops')).toBe(1);
  });

  it('leaves the manual album with the media that is still in it', () => {
    migrateAll();
    expect(
      rows(
        z.object({ item_count: z.number(), cover_item_id: z.string().nullable() }),
        `select item_count, cover_item_id from drive_albums where id = '${ALBUM}'`,
      ),
    ).toEqual([{ item_count: 2, cover_item_id: null }]);
    expect(
      rows(
        z.object({ cover_item_id: z.string().nullable() }),
        `select cover_item_id from drive_stacks where id = '${STACK}'`,
      ),
    ).toEqual([{ cover_item_id: null }]);
  });

  it('moves a synced placement with nothing selected to an empty exclusion list', () => {
    database
      .prepare("update drive_sync_clients set selected = '[]' where root_id = ?")
      .run(ROBIN_ROOT);
    migrateAll();
    expect(
      rows(
        z.object({ excluded: z.string() }),
        `select excluded from drive_placements where id = '${P_SYNCED}'`,
      ),
    ).toEqual([{ excluded: '[]' }]);
  });
});
