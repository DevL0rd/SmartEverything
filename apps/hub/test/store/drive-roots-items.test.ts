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
import { DriveGrantsRepository } from '../../src/store/repositories/drive-grants';
import { DriveRootsRepository } from '../../src/store/repositories/drive-roots';
import { DriveStarsRepository, starredBy } from '../../src/store/repositories/drive-stars';
import { ProfilesRepository } from '../../src/store/repositories/profiles';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';
import { drivePathOf, personalDriveRoot, sharedDriveRoot } from './drive-roots-fixture';

const NOW = '2026-11-07T00:00:00.000Z';
const LATER = '2026-11-08T00:00:00.000Z';
const ROOT = '0d000000-0000-4000-8000-000000000001';
const PERSON_ROOT = '0d000000-0000-4000-8000-000000000003';
const SHA = 'a'.repeat(64);
const PLAN = z.object({ detail: z.string() });

let database: DatabaseSync;
let sql: Sql;
let roots: DriveRootsRepository;
let items: DriveItemsRepository;
let stars: DriveStarsRepository;
let grants: DriveGrantsRepository;
let profile: string;
let friend: string;
let changes: { table: string; operation: string; record: unknown }[];

const health = {
  hashedShare: 0,
  verifiedShare: 0,
  corrupt: 0,
  lastScrubAt: null,
  lastBackupAt: null,
} as const;

beforeEach(() => {
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const log = testLogger();
  const feed = new ChangeFeed(log);
  sql = new Sql(database);
  const context = new StoreContext(sql, feed, () => new Date(NOW));
  migrate(sql, MIGRATIONS, NOW, log);
  roots = new DriveRootsRepository(context, drivePathOf);
  items = new DriveItemsRepository(context);
  stars = new DriveStarsRepository(context);
  grants = new DriveGrantsRepository(context);
  const profiles = new ProfilesRepository(context);
  profile = profiles.create({ name: 'Robin' }).id;
  friend = profiles.create({ name: 'Sam' }).id;
  changes = [];
  feed.subscribe((change) => {
    changes.push({ table: change.table, operation: change.operation, record: change.record });
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
    shared: false,
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

describe('drives', () => {
  it('round-trips the shared drive and a personal drive with paths from the layout and emits live changes without the path', () => {
    const shared = roots.insert(sharedDriveRoot(ROOT));
    const personal = roots.insert(personalDriveRoot(PERSON_ROOT, profile));
    expect(shared.path).toBe('/data/home/drive');
    expect(personal.path).toBe(`/data/people/${profile}/drive`);
    expect(roots.list().map((drive) => drive.id)).toEqual([ROOT, PERSON_ROOT]);
    expect(roots.byId(PERSON_ROOT).ownerProfileId).toBe(profile);
    expect(changes.map((change) => [change.table, change.operation])).toEqual([
      ['drive_roots', 'INSERT'],
      ['drive_roots', 'INSERT'],
    ]);
    for (const change of changes) {
      expect(change.record).not.toHaveProperty('path');
    }
  });

  it('finds a drive by its identity', () => {
    roots.insert(sharedDriveRoot(ROOT));
    roots.insert(personalDriveRoot(PERSON_ROOT, profile));
    expect(roots.byIdentity('home', null)?.id).toBe(ROOT);
    expect(roots.byIdentity('person', profile)?.id).toBe(PERSON_ROOT);
    expect(roots.byIdentity('person', friend)).toBeUndefined();
  });

  it('allows one shared drive and one drive per person', () => {
    roots.insert(sharedDriveRoot(ROOT));
    roots.insert(personalDriveRoot(PERSON_ROOT, profile));
    expect(() => roots.insert(sharedDriveRoot('0d000000-0000-4000-8000-000000000009'))).toThrow();
    expect(() =>
      roots.insert(personalDriveRoot('0d000000-0000-4000-8000-00000000000a', profile)),
    ).toThrow();
    expect(roots.list()).toHaveLength(2);
  });

  it('updates fields, health and settings, and emits an update with the old row', () => {
    roots.insert(sharedDriveRoot(ROOT));
    const updated = roots.update(ROOT, {
      state: 'unresponsive',
      stateReason: 'the scan timed out',
      items: 5,
      versions: false,
      skipPatterns: ['*.tmp'],
      includeHidden: true,
      health: { ...health, corrupt: 2, lastScrubAt: LATER },
    });
    expect(updated.state).toBe('unresponsive');
    expect(updated.items).toBe(5);
    expect(updated.versions).toBe(false);
    expect(updated.skipPatterns).toEqual(['*.tmp']);
    expect(updated.includeHidden).toBe(true);
    expect(updated.health.corrupt).toBe(2);
    expect(updated.path).toBe('/data/home/drive');
    expect(changes.at(-1)).toMatchObject({ table: 'drive_roots', operation: 'UPDATE' });
  });

  it('refuses an unknown drive', () => {
    expect(() => roots.byId(ROOT)).toThrow();
    expect(roots.find(ROOT)).toBeUndefined();
  });
});

describe('items', () => {
  beforeEach(() => {
    roots.insert(sharedDriveRoot(ROOT));
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
    expect(items.byPath(ROOT, 'a.txt', null)?.id).toBe(itemId(1));
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
    expect(items.byId(itemId(1), null).openedAt).toBe(LATER);
    expect(items.byId(itemId(1), null).rev).toBe(1);
    const rewritten = items.write({ item: file(itemId(1), 'a.txt', { bytes: 11 }), identity });
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
    const photo = items.byId(itemId(2), null);
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
        shared: false,
        outside: false,
        addedByProfileId: null,
        remoteId: null,
        remoteRev: null,
      },
      identity: { dev: '2049', ino: '900' },
    });
    expect(items.byId(itemId(3), null).kind).toBe('folder');
  });

  it('pages children by cursor through the parent index', () => {
    for (let index = 1; index <= 5; index += 1) {
      items.write({
        item: file(itemId(index), `f${String(index)}.txt`),
        identity: { ...identity, ino: String(index) },
      });
    }
    const first = items.children({
      rootId: ROOT,
      parentId: null,
      after: null,
      limit: 2,
      viewer: null,
    });
    expect(first.entries.map((entry) => entry.item.name)).toEqual(['f1.txt', 'f2.txt']);
    const second = items.children({
      rootId: ROOT,
      parentId: null,
      after: first.next,
      limit: 2,
      viewer: null,
    });
    expect(second.entries.map((entry) => entry.item.name)).toEqual(['f3.txt', 'f4.txt']);
    const last = items.children({
      rootId: ROOT,
      parentId: null,
      after: second.next,
      limit: 2,
      viewer: null,
    });
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
    expect(
      items
        .children({ rootId: ROOT, parentId: null, after: null, limit: 10, viewer: null })
        .entries.map((entry) => entry.identity),
    ).toEqual([identity]);
  });
});

describe('stars', () => {
  beforeEach(() => {
    roots.insert(sharedDriveRoot(ROOT));
    items.write({ item: file(itemId(1), 'a.txt'), identity });
  });

  it('computes starred for the viewer and keeps the star personal', () => {
    stars.star(profile, itemId(1));
    expect(items.byId(itemId(1), profile).starred).toBe(true);
    expect(items.byId(itemId(1), friend).starred).toBe(false);
    expect(items.byId(itemId(1), null).starred).toBe(false);
    expect(items.byPath(ROOT, 'a.txt', profile)?.starred).toBe(true);
    expect(
      items.children({ rootId: ROOT, parentId: null, after: null, limit: 10, viewer: profile })
        .entries[0]?.item.starred,
    ).toBe(true);
    expect(
      items.children({ rootId: ROOT, parentId: null, after: null, limit: 10, viewer: friend })
        .entries[0]?.item.starred,
    ).toBe(false);
  });

  it('stars and unstars without touching the item revision', () => {
    stars.star(profile, itemId(1));
    stars.star(profile, itemId(1));
    expect(stars.isStarred(profile, itemId(1))).toBe(true);
    expect(items.byId(itemId(1), profile).rev).toBe(1);
    stars.unstar(profile, itemId(1));
    expect(stars.isStarred(profile, itemId(1))).toBe(false);
    expect(items.byId(itemId(1), profile).starred).toBe(false);
  });

  it('ignores a starred flag in a write and drops stars with the item', () => {
    const written = items.write({ item: file(itemId(1), 'a.txt', { starred: true }), identity });
    expect(written.changed).toBe(false);
    stars.star(profile, itemId(1));
    items.remove(itemId(1));
    expect(database.prepare('select count(*) as n from drive_stars').get()).toEqual({ n: 0 });
  });

  it('offers one fragment that reads the star of a profile', () => {
    stars.star(friend, itemId(1));
    const row = sql.all(
      z.object({ id: z.string() }),
      `select i.id from drive_items i where ${starredBy('$profile')}`,
      { profile: friend },
    );
    expect(row.map((entry) => entry.id)).toEqual([itemId(1)]);
    expect(
      sql.all(
        z.object({ id: z.string() }),
        `select i.id from drive_items i where ${starredBy('$profile')}`,
        {
          profile,
        },
      ),
    ).toEqual([]);
  });
});

describe('grants', () => {
  beforeEach(() => {
    roots.insert(personalDriveRoot(PERSON_ROOT, profile));
    items.write({ item: file(itemId(1), 'a.txt', { rootId: PERSON_ROOT }), identity });
    changes.length = 0;
  });

  it('upserts one grant per item and person and emits only real changes', () => {
    const view = grants.set({ itemId: itemId(1), profileId: friend, role: 'view' }, profile);
    expect(view).toMatchObject({
      itemId: itemId(1),
      profileId: friend,
      role: 'view',
      grantedBy: profile,
    });
    const same = grants.set({ itemId: itemId(1), profileId: friend, role: 'view' }, profile);
    expect(same.id).toBe(view.id);
    const edit = grants.set({ itemId: itemId(1), profileId: friend, role: 'edit' }, profile);
    expect(edit.id).toBe(view.id);
    expect(edit.role).toBe('edit');
    expect(changes.map((change) => change.operation)).toEqual(['INSERT', 'UPDATE']);
    expect(grants.forItem(itemId(1))).toHaveLength(1);
    expect(grants.forPerson(itemId(1), friend)?.role).toBe('edit');
  });

  it('lists the grants an item has, a person received and a person made', () => {
    grants.set({ itemId: itemId(1), profileId: friend, role: 'view' }, profile);
    expect(grants.receivedBy(friend).map((grant) => grant.itemId)).toEqual([itemId(1)]);
    expect(grants.receivedBy(profile)).toEqual([]);
    expect(grants.madeBy(profile).map((grant) => grant.profileId)).toEqual([friend]);
    expect(grants.madeBy(friend)).toEqual([]);
  });

  it('removes a grant and emits a delete with the old row', () => {
    const grant = grants.set({ itemId: itemId(1), profileId: friend, role: 'view' }, profile);
    grants.remove(grant.id);
    expect(grants.find(grant.id)).toBeUndefined();
    expect(changes.at(-1)).toMatchObject({ table: 'drive_grants', operation: 'DELETE' });
    expect(() => {
      grants.remove(grant.id);
    }).toThrow();
  });

  it('refuses a grant to oneself and drops grants with the item', () => {
    expect(() =>
      grants.set({ itemId: itemId(1), profileId: profile, role: 'view' }, profile),
    ).toThrow();
    grants.set({ itemId: itemId(1), profileId: friend, role: 'view' }, profile);
    items.remove(itemId(1));
    expect(grants.receivedBy(friend)).toEqual([]);
  });

  it('marks an item shared by an active grant or an active link only', () => {
    expect(items.byId(itemId(1), profile).shared).toBe(false);
    const grant = grants.set({ itemId: itemId(1), profileId: friend, role: 'view' }, profile);
    expect(items.byId(itemId(1), profile).shared).toBe(true);
    grants.remove(grant.id);
    expect(items.byId(itemId(1), profile).shared).toBe(false);
    const link = (revokedAt: string | null, expiresAt: string | null): void => {
      database.exec('delete from drive_shares');
      database
        .prepare(
          `insert into drive_shares (id, item_id, token_hash, permission, expires_at, password_hash,
            created_by, created_at, revoked_at, opens, downloads, last_opened_at)
            values ('0d000000-0000-4000-8000-0000000000a1', ?, 'hash', 'view', ?, null, ?, ?, ?, 0, 0, null)`,
        )
        .run(itemId(1), expiresAt, profile, NOW, revokedAt);
    };
    link(null, null);
    expect(items.byId(itemId(1), profile).shared).toBe(true);
    link(LATER, null);
    expect(items.byId(itemId(1), profile).shared).toBe(false);
    link(null, '2026-11-06T00:00:00.000Z');
    expect(items.byId(itemId(1), profile).shared).toBe(false);
  });
});
