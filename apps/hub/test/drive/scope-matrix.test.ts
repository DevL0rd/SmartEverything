import type {
  DriveBackupStatus,
  DriveChangedNotice,
  DriveQuery,
  DriveScrubState,
  DriveStats,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DriveActor } from '../../src/drive/access';
import { DriveHealthReader } from '../../src/drive/health';
import type { DriveHealthFigures } from '../../src/drive/units/health';
import { DriveRecentReader } from '../../src/drive/recent';
import { DriveSearch } from '../../src/drive/search';
import { DriveReadService } from '../../src/drive/service-read';
import { readDriveStats } from '../../src/drive/stats';
import type { WatchStatus } from '../../src/drive/watcher';
import { readDriveUsage } from '../../src/drive/usage';
import { driveNoticeSeenBy } from '../../src/server/live-access';
import { photoMembership } from '../../src/photos/membership';
import { captureLogs } from '../support/logs';
import { addPerson, type TestPerson } from '../support/phone-fixtures';
import type { TestStore } from '../support/store';
import { personalDriveRoot, sharedDriveRoot } from '../store/drive-roots-fixture';
import { driveTestStore, putItem } from './spaces-fixture';

const HOME = '0d000000-0000-4000-8000-000000000001';
const OWNER_DRIVE = '0d000000-0000-4000-8000-000000000002';
const A_DRIVE = '0d000000-0000-4000-8000-000000000003';
const B_DRIVE = '0d000000-0000-4000-8000-000000000004';
const id = (n: number): string => `0e000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const VIEW_DIR = id(1);
const VIEW_FILE = id(2);
const EDIT_DIR = id(3);
const EDIT_FILE = id(4);
const OUTSIDE = id(5);
const SHARED_FILE = id(6);
const OWNER_FILE = id(7);
const B_FILE = id(8);
const WATCHING: WatchStatus = { watching: true, unreadable: [], problem: null };
const SPACE = { totalBytes: 1000, freeBytes: 500, fsType: 'ext4' } as const;

let opened: TestStore;
let owner: TestPerson;
let a: TestPerson;
let b: TestPerson;
let read: DriveReadService;
let search: DriveSearch;

const actorOf = (person: TestPerson): DriveActor => ({ profileId: person.profileId });

function query(fields: Partial<DriveQuery> = {}): DriveQuery {
  return {
    text: null,
    match: 'all',
    rootId: null,
    folderId: null,
    kinds: null,
    starred: null,
    duration: null,
    taken: null,
    sort: { field: 'name', direction: 'asc' },
    cursor: null,
    ...fields,
  };
}

function found(person: TestPerson, fields: Partial<DriveQuery> = {}): string[] {
  return search
    .search(actorOf(person), query(fields), 100)
    .items.map((item) => item.id)
    .sort();
}

beforeEach(async () => {
  captureLogs();
  opened = await driveTestStore();
  owner = addPerson(opened, 'Robin', 'owner');
  a = addPerson(opened, 'Ann', 'member');
  b = addPerson(opened, 'Bob', 'member');
  const { store } = opened;
  store.driveRoots.insert(sharedDriveRoot(HOME));
  store.driveRoots.insert(personalDriveRoot(OWNER_DRIVE, owner.profileId));
  store.driveRoots.insert(personalDriveRoot(A_DRIVE, a.profileId));
  store.driveRoots.insert(personalDriveRoot(B_DRIVE, b.profileId));
  putItem(store, {
    rootId: A_DRIVE,
    id: VIEW_DIR,
    relPath: 'view',
    kind: 'folder',
    addedBy: a.profileId,
  });
  putItem(store, {
    rootId: A_DRIVE,
    id: VIEW_FILE,
    relPath: 'view/inside.txt',
    kind: 'document',
    addedBy: a.profileId,
  });
  putItem(store, {
    rootId: A_DRIVE,
    id: EDIT_DIR,
    relPath: 'edit',
    kind: 'folder',
    addedBy: a.profileId,
  });
  putItem(store, {
    rootId: A_DRIVE,
    id: EDIT_FILE,
    relPath: 'edit/inside.txt',
    kind: 'document',
    addedBy: a.profileId,
  });
  putItem(store, {
    rootId: A_DRIVE,
    id: OUTSIDE,
    relPath: 'outside.txt',
    kind: 'document',
    addedBy: a.profileId,
  });
  putItem(store, {
    rootId: HOME,
    id: SHARED_FILE,
    relPath: 'shared.txt',
    kind: 'document',
    addedBy: owner.profileId,
  });
  putItem(store, {
    rootId: OWNER_DRIVE,
    id: OWNER_FILE,
    relPath: 'mine.txt',
    kind: 'document',
    addedBy: owner.profileId,
  });
  putItem(store, {
    rootId: B_DRIVE,
    id: B_FILE,
    relPath: 'bob.txt',
    kind: 'document',
    addedBy: b.profileId,
  });
  store.driveGrants.set(
    { itemId: VIEW_DIR, profileId: b.profileId, role: 'view', expiresAt: null },
    a.profileId,
  );
  store.driveGrants.set(
    { itemId: EDIT_DIR, profileId: b.profileId, role: 'edit', expiresAt: null },
    a.profileId,
  );
  read = new DriveReadService(store);
  search = new DriveSearch(store.context);
});

afterEach(async () => {
  await opened.close();
});

describe('who reaches what', () => {
  it('keeps the hub owner out of a member drive: no list, read, browse or search', async () => {
    const me = actorOf(owner);
    expect((await read.listRoots(me)).map((root) => root.id).sort()).toEqual(
      [HOME, OWNER_DRIVE].sort(),
    );
    for (const item of [VIEW_DIR, VIEW_FILE, EDIT_FILE, OUTSIDE]) {
      await expect(read.readItem(me, item)).rejects.toThrow(/no such/);
    }
    await expect(read.browseFolder(me, { rootId: A_DRIVE })).rejects.toThrow(/no such/);
    await expect(read.browseFolder(me, { rootId: A_DRIVE, folderId: VIEW_DIR })).rejects.toThrow(
      /no such/,
    );
    expect(found(owner)).toEqual([SHARED_FILE, OWNER_FILE].sort());
    expect(found(owner, { kinds: ['document'] })).toEqual([SHARED_FILE, OWNER_FILE].sort());
  });

  it('gives the grantee the shared folders and what is inside, and nothing outside', async () => {
    const me = actorOf(b);
    for (const item of [VIEW_DIR, VIEW_FILE, EDIT_DIR, EDIT_FILE]) {
      expect((await read.readItem(me, item)).id).toBe(item);
    }
    await expect(read.readItem(me, OUTSIDE)).rejects.toThrow(/no such/);
    await expect(read.browseFolder(me, { rootId: A_DRIVE })).rejects.toThrow(/no such/);
    expect(
      (await read.browseFolder(me, { rootId: A_DRIVE, folderId: VIEW_DIR })).items.map((i) => i.id),
    ).toEqual([VIEW_FILE]);
    expect(found(b, { kinds: ['document'] })).toEqual(
      [SHARED_FILE, B_FILE, VIEW_FILE, EDIT_FILE].sort(),
    );
    expect(found(b)).toEqual(
      [SHARED_FILE, B_FILE, VIEW_DIR, VIEW_FILE, EDIT_DIR, EDIT_FILE].sort(),
    );
    expect((await read.listRoots(me)).map((root) => root.id)).not.toContain(A_DRIVE);
  });

  it('reaches the sharer’s own drive in full and never the grantee’s', async () => {
    expect(found(a)).toEqual(
      [SHARED_FILE, VIEW_DIR, VIEW_FILE, EDIT_DIR, EDIT_FILE, OUTSIDE].sort(),
    );
    await expect(read.readItem(actorOf(a), B_FILE)).rejects.toThrow(/no such/);
  });

  it('lists recent activity only for what the person can open', async () => {
    const { driveFeed } = opened.store;
    for (const [item, root] of [
      [OUTSIDE, A_DRIVE],
      [VIEW_FILE, A_DRIVE],
      [SHARED_FILE, HOME],
    ] as const) {
      driveFeed.append({
        rootId: root,
        itemId: item,
        op: 'create',
        rev: 1,
        actorProfileId: a.profileId,
        via: 'app',
        deviceId: null,
      });
    }
    const recent = (person: TestPerson): string[] =>
      new DriveRecentReader(opened.store.context)
        .read(actorOf(person), { filter: 'added', cursor: null }, 50)
        .entries.flatMap((entry) => (entry.kind === 'shortcut' ? [] : [entry.item.id]))
        .sort();
    expect(recent(owner)).toEqual([SHARED_FILE]);
    expect(recent(b)).toEqual([SHARED_FILE, VIEW_FILE].sort());
    expect(recent(a)).toEqual([OUTSIDE, SHARED_FILE, VIEW_FILE].sort());
    expect(
      (await read.readRecent(actorOf(owner), { filter: 'added' })).entries.flatMap((entry) =>
        entry.kind === 'shortcut' ? [] : [entry.item.id],
      ),
    ).toEqual([SHARED_FILE]);
  });
});

describe('stars are personal', () => {
  it('shows a star only to the person who set it, in any drive', async () => {
    const { driveStars } = opened.store;
    driveStars.star(a.profileId, OUTSIDE);
    driveStars.star(b.profileId, SHARED_FILE);
    expect(found(a, { starred: true })).toEqual([OUTSIDE]);
    expect(found(owner, { starred: true })).toEqual([]);
    expect(found(b, { starred: true })).toEqual([SHARED_FILE]);
    expect(found(a, { starred: false })).not.toContain(OUTSIDE);
    expect((await read.readItem(actorOf(b), SHARED_FILE)).starred).toBe(true);
    expect((await read.readItem(actorOf(owner), SHARED_FILE)).starred).toBe(false);
  });

  it('does not let a star on an item the owner cannot open make it reachable', () => {
    opened.store.driveStars.star(owner.profileId, OUTSIDE);
    expect(found(owner, { starred: true })).toEqual([]);
  });
});

describe('totals only for the hub owner', () => {
  it('gives the owner one totals row per person and a member only their own', () => {
    const rows = readDriveUsage(opened.store.driveQuotas, { role: 'owner' });
    const ann = rows.find((row) => row.profileId === a.profileId);
    expect(ann).toMatchObject({ items: 3, folders: 2 });
    expect(Object.keys(ann ?? {}).sort()).toEqual(
      ['folders', 'items', 'live', 'profileId', 'quota', 'trash', 'versions'].sort(),
    );
    expect(
      readDriveUsage(opened.store.driveQuotas, { role: 'member', profileId: b.profileId }).map(
        (row) => row.profileId,
      ),
    ).toEqual([b.profileId]);
  });

  it('gives a member their own space limit beside their totals', () => {
    opened.store.driveQuotas.set(b.profileId, 5000);
    expect(
      readDriveUsage(opened.store.driveQuotas, { role: 'member', profileId: b.profileId }),
    ).toEqual([expect.objectContaining({ profileId: b.profileId, quota: 5000 })]);
    const rows = readDriveUsage(opened.store.driveQuotas, { role: 'owner' });
    expect(rows.find((row) => row.profileId === a.profileId)?.quota).toBeNull();
  });

  it('counts only the drives the person can open in stats and health', async () => {
    const { store } = opened;
    const stats = (actor: DriveActor): Promise<DriveStats> =>
      readDriveStats(store, actor, () => Promise.resolve(SPACE));
    const ownerStats = await stats(actorOf(owner));
    expect(ownerStats.roots.map((row) => row.rootId).sort()).toEqual([HOME, OWNER_DRIVE].sort());
    expect(ownerStats.items).toBe(2);
    const annStats = await stats(actorOf(a));
    expect(annStats.items).toBe(4);
    const health = new DriveHealthReader({
      figures: (actor): Promise<DriveHealthFigures> =>
        store.host.read('driveHealthFigures', { actor }),
      watcher: (): WatchStatus => WATCHING,
      scrub: (): Promise<DriveScrubState> =>
        Promise.resolve({ state: 'idle', lastFinishedAt: null, corrupt: 0 }),
      backup: (): Promise<DriveBackupStatus> => Promise.resolve({ last: null, lastOkAt: null }),
      space: (): Promise<typeof SPACE> => Promise.resolve(SPACE),
    });
    expect((await health.read(actorOf(owner))).rootsTotal).toBe(2);
    expect((await health.read(actorOf(a))).rootsTotal).toBe(2);
    expect((await health.read(actorOf(a))).space).toEqual(SPACE);
  });
});

describe('notices', () => {
  const changed = (rootIds: string[], folderIds: string[]): DriveChangedNotice => ({
    type: 'drive_changed',
    rootIds,
    folderIds,
    albumIds: [],
    months: [],
    cursor: 1,
  });
  const hearing = (person: TestPerson): { client: TestPerson['client'] } => ({
    client: person.client,
  });

  it('hides every notice about a member’s unshared drive from the hub owner', () => {
    expect(
      driveNoticeSeenBy(hearing(owner), changed([A_DRIVE], [OUTSIDE, VIEW_DIR]), opened.store),
    ).toBeNull();
  });

  it('tells the grantee about the shared folder only', () => {
    expect(
      driveNoticeSeenBy(
        hearing(b),
        changed([A_DRIVE], [OUTSIDE, VIEW_DIR, EDIT_FILE]),
        opened.store,
      ),
    ).toEqual(changed([], [VIEW_DIR, EDIT_FILE]));
  });
});

describe('Photos visibility', () => {
  it('uses the same access rule: no owner pass in the membership clause', () => {
    expect(photoMembership('i.id')).not.toContain('in_photos');
  });
});
