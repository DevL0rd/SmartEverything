import type { DriveTrashEntry } from '@smarteverything/domain';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import {
  DriveAlbumKindError,
  DriveAlbumsRepository,
} from '../../src/store/repositories/drive-albums';
import { DriveDaysRepository } from '../../src/store/repositories/drive-days';
import { DriveFeedRepository } from '../../src/store/repositories/drive-feed';
import { DriveItemsRepository } from '../../src/store/repositories/drive-items';
import { DriveRootsRepository } from '../../src/store/repositories/drive-roots';
import { DriveTrashRepository } from '../../src/store/repositories/drive-trash';
import { ProfilesRepository } from '../../src/store/repositories/profiles';
import { Sql, StoreConflictError } from '../../src/store/sql';
import { testLogger } from '../support/logs';
import { drivePathOf, personalDriveRoot, sharedDriveRoot } from './drive-roots-fixture';

const NOW = '2026-11-07T00:00:00.000Z';
const ROOT = '0d000000-0000-4000-8000-000000000001';
const OTHER_ROOT = '0d000000-0000-4000-8000-000000000002';
const DEVICE = '0d000000-0000-4000-8000-0000000000d1';
const ALBUM = '0a000000-0000-4000-8000-000000000001';
const SMART = '0a000000-0000-4000-8000-000000000002';

let database: DatabaseSync;
let context: StoreContext;
let albums: DriveAlbumsRepository;
let trash: DriveTrashRepository;
let days: DriveDaysRepository;
let feed: DriveFeedRepository;
let items: DriveItemsRepository;
let profile: string;
let changes: { table: string; operation: string }[];
let clock: Date;

function itemId(index: number): string {
  return `0d000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function addItem(index: number): string {
  const id = itemId(index);
  items.write({
    item: {
      id,
      rootId: ROOT,
      parentId: null,
      relPath: `f${String(index)}.txt`,
      name: `f${String(index)}.txt`,
      kind: 'document',
      mime: 'text/plain',
      bytes: 10,
      sha256: null,
      integrity: 'unknown',
      thumb: { state: 'none' },
      modifiedAt: NOW,
      addedAt: NOW,
      starred: false,
      shared: false,
      outside: false,
      addedByProfileId: profile,
      remoteId: null,
      remoteRev: null,
    },
    identity: { dev: '1', ino: String(index) },
  });
  return id;
}

function trashEntry(index: number, fields: Partial<DriveTrashEntry> = {}): DriveTrashEntry {
  return {
    itemId: itemId(index),
    rootId: ROOT,
    name: `f${String(index)}.txt`,
    originalRelPath: `f${String(index)}.txt`,
    trashRelPath: `.smarteverything/trash/${String(index)}`,
    isFolder: false,
    bytes: 100,
    deletedAt: `2026-11-0${String(index)}T00:00:00.000Z`,
    purgeAt: `2027-11-0${String(index)}T00:00:00.000Z`,
    deletedBy: profile,
    addedByProfileId: profile,
    ...fields,
  };
}

beforeEach(() => {
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const log = testLogger();
  const changeFeed = new ChangeFeed(log);
  clock = new Date(NOW);
  context = new StoreContext(new Sql(database), changeFeed, () => clock);
  migrate(new Sql(database), MIGRATIONS, NOW, log);
  const roots = new DriveRootsRepository(context, drivePathOf);
  items = new DriveItemsRepository(context);
  albums = new DriveAlbumsRepository(context);
  trash = new DriveTrashRepository(context);
  days = new DriveDaysRepository(context);
  feed = new DriveFeedRepository(context);
  profile = new ProfilesRepository(context).create({ name: 'Robin' }).id;
  roots.insert(sharedDriveRoot(ROOT));
  roots.insert(personalDriveRoot(OTHER_ROOT, profile));
  changes = [];
  changeFeed.subscribe((change) => {
    changes.push({ table: change.table, operation: change.operation });
  });
});

afterEach(() => {
  database.close();
});

describe('albums', () => {
  const manual = {
    id: ALBUM,
    title: 'Trip',
    kind: 'manual',
    surface: 'drive',
    scope: 'home',
    ownerProfileId: null,
    coverItemId: null,
  } as const;

  it('creates a manual album and keeps the count and live changes as items come and go', () => {
    albums.insert(manual);
    const ids = [addItem(1), addItem(2), addItem(3)];
    const added = albums.addItems(ALBUM, ids);
    expect(added.itemCount).toBe(3);
    expect(albums.addItems(ALBUM, [ids[0] ?? '']).itemCount).toBe(3);
    expect(albums.removeItems(ALBUM, [ids[1] ?? '']).itemCount).toBe(2);
    expect(albums.members(ALBUM, null, 10).members.map((member) => member.itemId)).toEqual([
      ids[0],
      ids[2],
    ]);
    expect(
      changes.filter((change) => change.table === 'drive_albums').map((c) => c.operation),
    ).toEqual(['INSERT', 'UPDATE', 'UPDATE', 'UPDATE']);
  });

  it('pages members by position and item through the position index', () => {
    albums.insert(manual);
    albums.addItems(ALBUM, [addItem(1), addItem(2), addItem(3), addItem(4), addItem(5)]);
    const first = albums.members(ALBUM, null, 2);
    const second = albums.members(ALBUM, first.next, 2);
    const last = albums.members(ALBUM, second.next, 2);
    expect([first, second, last].flatMap((page) => page.members.map((m) => m.itemId))).toEqual(
      [1, 2, 3, 4, 5].map(itemId),
    );
    expect(last.next).toBeNull();
  });

  it('moves an item between neighbours and renumbers when the gap is used up', () => {
    albums.insert(manual);
    albums.addItems(ALBUM, [addItem(1), addItem(2), addItem(3)]);
    albums.moveItem(ALBUM, itemId(3), { before: itemId(1), after: itemId(2) });
    const order = (): string[] =>
      albums.members(ALBUM, null, 10).members.map((member) => member.itemId);
    expect(order()).toEqual([itemId(1), itemId(3), itemId(2)]);
    for (let step = 0; step < 60; step += 1) {
      albums.moveItem(ALBUM, itemId(3), { before: itemId(1), after: itemId(2) });
    }
    expect(order()).toEqual([itemId(1), itemId(3), itemId(2)]);
    albums.moveItem(ALBUM, itemId(2), { before: null, after: itemId(1) });
    expect(order()[0]).toBe(itemId(2));
  });

  it('clears a cover that leaves the album and drops an item from every album', () => {
    albums.insert({ ...manual, coverItemId: null });
    const one = addItem(1);
    albums.addItems(ALBUM, [one, addItem(2)]);
    albums.update(ALBUM, { coverItemId: one });
    expect(albums.removeItems(ALBUM, [one]).coverItemId).toBeNull();
    albums.addItems(ALBUM, [one]);
    albums.dropItem(one);
    expect(albums.byId(ALBUM).itemCount).toBe(1);
    expect(albums.albumsOf(one)).toEqual([]);
  });

  it('keeps smart albums rule-driven and refuses manual membership changes', () => {
    const rule = { match: 'all', rules: [{ kind: 'starred', starred: true }] } as const;
    albums.insert({
      id: SMART,
      title: 'Starred',
      kind: 'smart',
      rule,
      surface: 'drive',
      scope: 'person',
      ownerProfileId: profile,
      coverItemId: null,
    });
    expect(albums.setItemCount(SMART, 7).itemCount).toBe(7);
    const edited = { match: 'any', rules: [{ kind: 'starred', starred: false }] } as const;
    const updated = albums.update(SMART, { rule: edited });
    expect(updated.kind === 'smart' && updated.rule).toEqual(edited);
    expect(() => albums.addItems(SMART, [addItem(1)])).toThrow(DriveAlbumKindError);
    albums.insert(manual);
    expect(() => albums.update(ALBUM, { rule })).toThrow(DriveAlbumKindError);
    expect(() => albums.setItemCount(ALBUM, 1)).toThrow(DriveAlbumKindError);
  });

  it('keeps Photos and Drive albums in separate lists', () => {
    albums.insert(manual);
    albums.insert({ ...manual, id: SMART, title: 'Camera roll', surface: 'photos' });
    expect(albums.list('drive').map((album) => album.id)).toEqual([ALBUM]);
    expect(albums.list('photos').map((album) => album.id)).toEqual([SMART]);
    expect(albums.listVisibleTo(profile, 'photos').map((album) => album.id)).toEqual([SMART]);
    expect(albums.listAll()).toHaveLength(2);
    expect(albums.byId(SMART).surface).toBe('photos');
  });

  it('lists albums visible to a person and removes an album with its members', () => {
    albums.insert(manual);
    albums.insert({
      id: SMART,
      title: 'Mine',
      kind: 'smart',
      rule: { match: 'all', rules: [{ kind: 'starred', starred: true }] },
      surface: 'drive',
      scope: 'person',
      ownerProfileId: profile,
      coverItemId: null,
    });
    expect(albums.list('drive').map((album) => album.title)).toEqual(['Mine', 'Trip']);
    expect(albums.listVisibleTo(profile, 'drive')).toHaveLength(2);
    expect(
      albums.listVisibleTo('0d000000-0000-4000-8000-0000000000ff', 'drive').map((a) => a.id),
    ).toEqual([ALBUM]);
    albums.addItems(ALBUM, [addItem(1)]);
    albums.remove(ALBUM);
    expect(albums.find(ALBUM)).toBeUndefined();
    expect(albums.albumsOf(itemId(1))).toEqual([]);
    expect(changes.at(-1)).toEqual({ table: 'drive_albums', operation: 'DELETE' });
    expect(() => {
      albums.remove(ALBUM);
    }).toThrow();
  });
});

describe('trash', () => {
  it('stores and returns an entry with its adder and refuses a duplicate or a bad purge date', () => {
    trash.insert(trashEntry(1));
    expect(trash.byId(itemId(1)).addedByProfileId).toBe(profile);
    expect(() => trash.insert(trashEntry(1))).toThrow(StoreConflictError);
    expect(() => trash.insert(trashEntry(2, { purgeAt: '2026-11-01T00:00:00.000Z' }))).toThrow();
  });

  it('pages a root newest first and finds the soonest purge and what is due', () => {
    for (const index of [1, 2, 3, 4]) {
      trash.insert(trashEntry(index));
    }
    trash.insert(trashEntry(5, { rootId: OTHER_ROOT }));
    const first = trash.inRoot(ROOT, null, 3);
    expect(first.entries.map((entry) => entry.itemId)).toEqual([4, 3, 2].map(itemId));
    const second = trash.inRoot(ROOT, first.next, 3);
    expect(second.entries.map((entry) => entry.itemId)).toEqual([itemId(1)]);
    expect(second.next).toBeNull();
    expect(trash.soonestPurge()).toBe('2027-11-01T00:00:00.000Z');
    expect(trash.due('2027-11-02T00:00:00.000Z', 10).map((entry) => entry.itemId)).toEqual([
      itemId(1),
      itemId(2),
    ]);
    expect(trash.due('2027-11-01T00:00:00.000Z', 10)).toHaveLength(1);
  });

  it('removes an entry, reports bytes per adder and has no soonest purge when empty', () => {
    expect(trash.soonestPurge()).toBeNull();
    trash.insert(trashEntry(1));
    trash.insert(trashEntry(2, { bytes: 50 }));
    trash.insert(trashEntry(3, { addedByProfileId: null, bytes: 7, isFolder: true }));
    const bytes = trash.bytesByAdder();
    expect(bytes).toHaveLength(2);
    expect(bytes.find((row) => row.addedByProfileId === profile)?.bytes).toBe(150);
    expect(bytes.find((row) => row.addedByProfileId === null)?.bytes).toBe(7);
    expect(trash.byId(itemId(3)).isFolder).toBe(true);
    expect(trash.remove(itemId(1)).itemId).toBe(itemId(1));
    expect(trash.find(itemId(1))).toBeUndefined();
    expect(() => trash.remove(itemId(1))).toThrow();
  });
});

describe('days', () => {
  it('overwrites the snapshot and accumulates added and removed on the same day', () => {
    days.record({ rootId: ROOT, day: '2026-11-01', items: 10, bytes: 100, added: 10, removed: 0 });
    days.record({ rootId: ROOT, day: '2026-11-01', items: 12, bytes: 130, added: 3, removed: 1 });
    expect(days.range(ROOT, '2026-11-01', '2026-11-30')).toEqual([
      { day: '2026-11-01', rootId: ROOT, items: 12, bytes: 130, added: 13, removed: 1 },
    ]);
  });

  it('sums roots per day inside a window and reports the recorded span', () => {
    expect(days.span()).toBeNull();
    days.record({ rootId: ROOT, day: '2026-11-01', items: 1, bytes: 10, added: 1, removed: 0 });
    days.record({
      rootId: OTHER_ROOT,
      day: '2026-11-01',
      items: 2,
      bytes: 20,
      added: 2,
      removed: 0,
    });
    days.record({ rootId: ROOT, day: '2026-11-03', items: 4, bytes: 40, added: 3, removed: 0 });
    expect(days.totals('2026-11-01', '2026-11-02')).toEqual([
      { day: '2026-11-01', items: 3, bytes: 30, added: 3, removed: 0 },
    ]);
    expect(days.totals('2026-11-01', '2026-11-30')).toHaveLength(2);
    expect(days.span()).toEqual({ first: '2026-11-01', latest: '2026-11-03' });
    expect(() => {
      days.record({ rootId: ROOT, day: 'yesterday', items: 0, bytes: 0, added: 0, removed: 0 });
    }).toThrow(StoreConflictError);
  });
});

describe('feed', () => {
  const base = {
    rootId: ROOT,
    rev: 1,
    actorProfileId: null,
    via: 'app',
    deviceId: null,
  } as const;

  it('appends rows with a rising seq and the store clock', () => {
    const first = feed.append({ ...base, itemId: itemId(1), op: 'create' });
    clock = new Date('2026-11-08T00:00:00.000Z');
    const second = feed.append({ ...base, itemId: itemId(1), op: 'update', rev: 2 });
    expect(second.seq).toBe(first.seq + 1);
    expect(first.at).toBe(NOW);
    expect(second.at).toBe('2026-11-08T00:00:00.000Z');
    expect(feed.latestSeq()).toBe(second.seq);
    expect(feed.latestSeqInRoot(OTHER_ROOT)).toBe(0);
  });

  it('commits with the caller transaction and rolls back with it', () => {
    expect(() => {
      context.write(() => {
        feed.append({ ...base, itemId: itemId(1), op: 'create' });
        throw new Error('stop');
      });
    }).toThrow('stop');
    expect(feed.latestSeq()).toBe(0);
    context.write(() => {
      feed.append({ ...base, itemId: itemId(1), op: 'create' });
      feed.append({ ...base, itemId: itemId(1), op: 'trash', rev: 2 });
    });
    expect(feed.since(0, 10).rows.map((row) => row.op)).toEqual(['create', 'trash']);
  });

  it('enforces the actor and device rules of the row', () => {
    expect(() =>
      feed.append({
        ...base,
        itemId: itemId(1),
        op: 'create',
        via: 'scan',
        actorProfileId: profile,
      }),
    ).toThrow(StoreConflictError);
    expect(() => feed.append({ ...base, itemId: itemId(1), op: 'create', via: 'mount' })).toThrow(
      StoreConflictError,
    );
    const mounted = feed.append({
      ...base,
      itemId: itemId(1),
      op: 'create',
      via: 'mount',
      deviceId: DEVICE,
    });
    expect(mounted.deviceId).toBe(DEVICE);
  });

  it('pages by cursor over everything, a root, an item, and the latest by operation', () => {
    for (let index = 1; index <= 5; index += 1) {
      feed.append({
        ...base,
        rootId: index % 2 === 0 ? OTHER_ROOT : ROOT,
        itemId: itemId(index % 2 === 0 ? 2 : 1),
        op: index === 5 ? 'trash' : 'create',
        rev: index,
      });
    }
    const first = feed.since(0, 2);
    const second = feed.since(first.next ?? 0, 2);
    const last = feed.since(second.next ?? 0, 2);
    expect([first, second, last].flatMap((page) => page.rows.map((row) => row.rev))).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect(last.next).toBeNull();
    expect(feed.sinceInRoot(OTHER_ROOT, 0, 10).rows.map((row) => row.rev)).toEqual([2, 4]);
    expect(feed.ofItem(itemId(1), 2, 10).rows.map((row) => row.rev)).toEqual([3, 5]);
    const recent = feed.recentOfItem(itemId(1), null, 2);
    expect(recent.rows.map((row) => row.rev)).toEqual([5, 3]);
    expect(feed.recentOfItem(itemId(1), recent.next, 2).rows.map((row) => row.rev)).toEqual([1]);
    expect(feed.latest(['create'], null, 2).rows.map((row) => row.rev)).toEqual([4, 3]);
    expect(feed.latest(['create'], 3, 5).rows.map((row) => row.rev)).toEqual([2, 1]);
    expect(feed.latest(['trash'], null, 5).rows.map((row) => row.rev)).toEqual([5]);
  });

  it('keeps feed rows after the item is gone and ends them with the root', () => {
    feed.append({ ...base, itemId: itemId(9), op: 'delete', rev: 3 });
    expect(feed.ofItem(itemId(9), 0, 10).rows).toHaveLength(1);
    database.prepare('delete from drive_roots where id = ?').run(ROOT);
    expect(feed.latestSeq()).toBe(0);
  });
});
