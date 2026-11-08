import type { DriveRoot } from '@smarteverything/domain';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import {
  DriveItemsRepository,
  driveEtag,
  type DriveItemDraft,
} from '../../src/store/repositories/drive-items';
import { DriveRootsRepository, UNSYNCED } from '../../src/store/repositories/drive-roots';
import { ProfilesRepository } from '../../src/store/repositories/profiles';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';

const NOW = '2026-11-07T00:00:00.000Z';
const LATER = '2026-11-08T00:00:00.000Z';
const ROOT = '0d000000-0000-4000-8000-000000000001';
const CAMERAS = '0d000000-0000-4000-8000-000000000002';
const PERSON_ROOT = '0d000000-0000-4000-8000-000000000003';
const CLIENT = '0d000000-0000-4000-8000-0000000000c1';
const SHA = 'a'.repeat(64);
const PLAN = z.object({ detail: z.string() });

let database: DatabaseSync;
let sql: Sql;
let roots: DriveRootsRepository;
let items: DriveItemsRepository;
let profile: string;
let changes: { table: string; operation: string }[];

const health = {
  hashedShare: 0,
  verifiedShare: 0,
  corrupt: 0,
  lastScrubAt: null,
  lastBackupAt: null,
} as const;

function folderRoot(fields: Partial<Extract<DriveRoot, { kind: 'folder' }>> = {}): DriveRoot {
  return {
    id: ROOT,
    kind: 'folder',
    label: 'Photos',
    scope: 'home',
    ownerProfileId: null,
    path: '/srv/photos',
    readOnly: true,
    versions: false,
    volume: null,
    indexId: 'index-1',
    state: 'ready',
    stateReason: null,
    items: 0,
    folders: 0,
    bytes: 0,
    scannedAt: null,
    health,
    inPhotos: false,
    skipPatterns: [],
    includeHidden: false,
    synced: false,
    sync: UNSYNCED,
    ...fields,
  };
}

function camerasRoot(): DriveRoot {
  return {
    id: CAMERAS,
    kind: 'cameras',
    label: 'Cameras',
    scope: 'home',
    ownerProfileId: null,
    path: null,
    readOnly: true,
    versions: false,
    synced: false,
    sync: null,
    indexId: 'index-2',
    state: 'ready',
    stateReason: null,
    items: 0,
    folders: 0,
    bytes: 0,
    scannedAt: null,
    health,
    inPhotos: true,
    skipPatterns: [],
    includeHidden: false,
  };
}

beforeEach(() => {
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const log = testLogger();
  const feed = new ChangeFeed(log);
  sql = new Sql(database);
  const context = new StoreContext(sql, feed, () => new Date(NOW));
  migrate(sql, MIGRATIONS, NOW, log);
  roots = new DriveRootsRepository(context);
  items = new DriveItemsRepository(context);
  profile = new ProfilesRepository(context).create({ name: 'Robin' }).id;
  changes = [];
  feed.subscribe((change) => {
    changes.push({ table: change.table, operation: change.operation });
  });
});

afterEach(() => {
  database.close();
});

type DocumentDraft = Extract<DriveItemDraft, { readonly kind: 'document' }>;

function file(id: string, name: string, fields: Partial<DocumentDraft> = {}): DocumentDraft {
  return {
    id,
    rootId: ROOT,
    parentId: null,
    relPath: name,
    name,
    kind: 'document',
    mime: 'text/plain',
    bytes: 10,
    sha256: null,
    integrity: 'unknown',
    thumb: { state: 'none' },
    modifiedAt: NOW,
    addedAt: NOW,
    starred: false,
    outside: false,
    addedByProfileId: profile,
    remoteId: null,
    remoteRev: null,
    ...fields,
  };
}

const identity = { dev: '2049', ino: '777' } as const;

function itemId(index: number): string {
  return `0d000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

describe('roots', () => {
  it('round-trips physical, synced and virtual roots and emits live changes', () => {
    roots.insert(folderRoot());
    roots.insert(camerasRoot());
    const synced = {
      ignorePatterns: ['*.tmp'],
      conflictCopies: true,
      clients: [{ clientId: CLIENT, enabled: true }],
    };
    roots.insert(
      folderRoot({
        id: PERSON_ROOT,
        label: 'Robin',
        scope: 'person',
        ownerProfileId: profile,
        path: '/srv/robin',
        readOnly: false,
        synced: true,
        sync: synced,
      }),
    );
    expect(roots.list().map((root) => root.label)).toEqual(['Cameras', 'Photos', 'Robin']);
    expect(roots.byId(ROOT).sync).toEqual(UNSYNCED);
    expect(roots.byId(CAMERAS).sync).toBeNull();
    expect(roots.byId(PERSON_ROOT).sync).toEqual(synced);
    expect(changes).toEqual([
      { table: 'drive_roots', operation: 'INSERT' },
      { table: 'drive_roots', operation: 'INSERT' },
      { table: 'drive_roots', operation: 'INSERT' },
    ]);
  });

  it('finds a root by its real path for the nesting check', () => {
    roots.insert(folderRoot());
    expect(roots.byPath('/srv/photos')?.id).toBe(ROOT);
    expect(roots.byPath('/srv/photos/inner')).toBeUndefined();
    expect(roots.byPath('/srv')).toBeUndefined();
  });

  it('updates fields, health and sync, and emits an update with the old row', () => {
    roots.insert(folderRoot());
    const updated = roots.update(ROOT, {
      state: 'offline',
      stateReason: 'unmounted',
      items: 5,
      health: { ...health, corrupt: 2, lastScrubAt: LATER },
      sync: { ignorePatterns: [], conflictCopies: true, clients: [] },
    });
    expect(updated.state).toBe('offline');
    expect(updated.items).toBe(5);
    expect(updated.health.corrupt).toBe(2);
    expect(updated.synced).toBe(true);
    expect(roots.update(ROOT, { sync: null }).synced).toBe(false);
    expect(changes.at(-1)).toEqual({ table: 'drive_roots', operation: 'UPDATE' });
  });

  it('removes a root with its items and refuses an unknown one', () => {
    roots.insert(folderRoot());
    items.write({ item: file(itemId(1), 'a.txt'), identity });
    roots.remove(ROOT);
    expect(roots.find(ROOT)).toBeUndefined();
    expect(items.find(itemId(1))).toBeUndefined();
    expect(() => {
      roots.remove(ROOT);
    }).toThrow();
    expect(changes.at(-1)).toEqual({ table: 'drive_roots', operation: 'DELETE' });
  });
});

describe('items', () => {
  beforeEach(() => {
    roots.insert(folderRoot({ readOnly: false }));
  });

  it('creates an item at rev 1 with its etag and adder, and stores the passed identity', () => {
    const written = items.write({
      item: file(itemId(1), 'a.txt', { sha256: SHA }),
      identity,
    });
    expect(written.changed).toBe(true);
    expect(written.item.rev).toBe(1);
    expect(written.item.etag).toBe(`1-${SHA}`);
    expect(written.item.addedByProfileId).toBe(profile);
    expect(items.identityOf(itemId(1))).toEqual(identity);
    expect(items.byPath(ROOT, 'a.txt')?.id).toBe(itemId(1));
  });

  it('leaves exactly one rev when the same stat is written again', () => {
    const input = { item: file(itemId(1), 'a.txt'), identity };
    items.write(input);
    const again = items.write(input);
    expect(again.changed).toBe(false);
    expect(again.item.rev).toBe(1);
    const changed = items.write({ item: file(itemId(1), 'a.txt', { bytes: 11 }), identity });
    expect(changed.changed).toBe(true);
    expect(changed.item.rev).toBe(2);
    expect(changed.item.etag).toBe(driveEtag(2, file(itemId(1), 'a.txt', { bytes: 11 })));
    const moved = items.write({
      item: file(itemId(1), 'a.txt', { bytes: 11 }),
      identity: { dev: '2049', ino: '778' },
    });
    expect(moved.item.rev).toBe(3);
  });

  it('keeps the opened time and rev when an item is opened', () => {
    items.write({ item: file(itemId(1), 'a.txt'), identity });
    items.markOpened(itemId(1), LATER);
    expect(items.byId(itemId(1)).openedAt).toBe(LATER);
    expect(items.byId(itemId(1)).rev).toBe(1);
    const rewritten = items.write({ item: file(itemId(1), 'a.txt', { starred: true }), identity });
    expect(rewritten.item.openedAt).toBe(LATER);
    expect(rewritten.item.rev).toBe(2);
  });

  it('round-trips media metadata and folders', () => {
    items.write({
      item: {
        ...file(itemId(2), 'p.jpg'),
        kind: 'image',
        mime: 'image/jpeg',
        takenAt: NOW,
        width: 4000,
        height: 3000,
        orientation: 1,
        camera: { make: 'Pixel', model: null, lens: null },
        exposure: null,
        place: { lat: 1.5, lon: 2.5 },
        thumb: { state: 'failed', reason: 'corrupt' },
      },
      identity,
    });
    const photo = items.byId(itemId(2));
    expect(photo.kind === 'image' && photo.camera?.make).toBe('Pixel');
    expect(photo.kind === 'image' && photo.place).toEqual({ lat: 1.5, lon: 2.5 });
    expect(photo.kind !== 'folder' && photo.thumb).toEqual({ state: 'failed', reason: 'corrupt' });
    items.write({
      item: {
        id: itemId(3),
        rootId: ROOT,
        parentId: null,
        relPath: 'dir',
        name: 'dir',
        kind: 'folder',
        childCount: 0,
        bytes: 0,
        modifiedAt: NOW,
        addedAt: NOW,
        starred: false,
        outside: false,
        addedByProfileId: null,
        remoteId: null,
        remoteRev: null,
      },
      identity: { dev: '2049', ino: '900' },
    });
    expect(items.byId(itemId(3)).kind).toBe('folder');
  });

  it('pages children by cursor through the parent index', () => {
    for (let index = 1; index <= 5; index += 1) {
      items.write({
        item: file(itemId(index), `f${String(index)}.txt`),
        identity: { ...identity, ino: String(index) },
      });
    }
    const first = items.children(ROOT, null, null, 2);
    expect(first.entries.map((entry) => entry.item.name)).toEqual(['f1.txt', 'f2.txt']);
    const second = items.children(ROOT, null, first.next, 2);
    expect(second.entries.map((entry) => entry.item.name)).toEqual(['f3.txt', 'f4.txt']);
    const last = items.children(ROOT, null, second.next, 2);
    expect(last.entries.map((entry) => entry.item.name)).toEqual(['f5.txt']);
    expect(last.next).toBeNull();
    const plan = sql
      .all(
        PLAN,
        `explain query plan select id from drive_items where root_id = $rootId and parent_id is $parentId and name > $after order by name limit 2`,
        { rootId: ROOT, parentId: null, after: 'f1' },
      )
      .map((row) => row.detail)
      .join(' ');
    expect(plan).toContain('drive_items_by_parent');
    expect(plan).not.toContain('TEMP B-TREE');
  });

  it('lists children with their stored identities for reconcile', () => {
    items.write({ item: file(itemId(1), 'a.txt'), identity });
    expect(items.children(ROOT, null, null, 10).entries.map((entry) => entry.identity)).toEqual([
      identity,
    ]);
  });
});
