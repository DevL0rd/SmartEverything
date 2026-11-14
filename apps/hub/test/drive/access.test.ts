import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  accessFilter,
  albumVisibleTo,
  canRead,
  canShare,
  canWrite,
  driveAccess,
  driveFilter,
  itemAccess,
  type DriveActor,
  type ItemAccess,
} from '../../src/drive/access';
import { captureLogs } from '../support/logs';
import type { TestStore } from '../support/store';
import { personalDriveRoot, sharedDriveRoot } from '../store/drive-roots-fixture';
import { driveTestStore, putItem } from './spaces-fixture';

const HOME = '0d000000-0000-4000-8000-000000000001';
const ROBIN_DRIVE = '0d000000-0000-4000-8000-000000000002';
const SAM_DRIVE = '0d000000-0000-4000-8000-000000000003';
const id = (n: number): string => `0e000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const TRIP = id(1);
const TRIP_FILE = id(2);
const TRIP_DEEP = id(3);
const TRIPOD_FILE = id(4);
const OTHER_FILE = id(5);
const SHARED_FILE = id(6);
const ROBIN_FILE = id(7);

let opened: TestStore;
let robin: DriveActor;
let sam: DriveActor;
let kim: DriveActor;

beforeEach(async () => {
  captureLogs();
  opened = await driveTestStore();
  const { store } = opened;
  robin = { profileId: store.profiles.first().id };
  sam = { profileId: store.profiles.create({ name: 'Sam' }).id };
  kim = { profileId: store.profiles.create({ name: 'Kim' }).id };
  store.driveRoots.insert(sharedDriveRoot(HOME));
  store.driveRoots.insert(personalDriveRoot(ROBIN_DRIVE, robin.profileId));
  store.driveRoots.insert(personalDriveRoot(SAM_DRIVE, sam.profileId));
  putItem(store, { rootId: SAM_DRIVE, id: TRIP, relPath: 'trip', kind: 'folder' });
  putItem(store, { rootId: SAM_DRIVE, id: TRIP_FILE, relPath: 'trip/a.txt', kind: 'document' });
  putItem(store, { rootId: SAM_DRIVE, id: id(8), relPath: 'trip/deeper', kind: 'folder' });
  putItem(store, {
    rootId: SAM_DRIVE,
    id: TRIP_DEEP,
    relPath: 'trip/deeper/b.txt',
    kind: 'document',
  });
  putItem(store, { rootId: SAM_DRIVE, id: id(9), relPath: 'tripod', kind: 'folder' });
  putItem(store, { rootId: SAM_DRIVE, id: TRIPOD_FILE, relPath: 'tripod/c.txt', kind: 'document' });
  putItem(store, { rootId: SAM_DRIVE, id: OTHER_FILE, relPath: 'other.txt', kind: 'document' });
  putItem(store, { rootId: HOME, id: SHARED_FILE, relPath: 'shared.txt', kind: 'document' });
  putItem(store, { rootId: ROBIN_DRIVE, id: ROBIN_FILE, relPath: 'mine.txt', kind: 'document' });
});

afterEach(async () => {
  await opened.close();
});

function accessTo(actor: DriveActor, itemId: string): ItemAccess {
  const { store } = opened;
  const item = store.driveItems.byId(itemId, actor.profileId);
  return itemAccess(store, actor, store.driveRoots.byId(item.rootId), item);
}

describe('drive access', () => {
  it('is own for your drive, shared for the Shared Drive and none for another person', () => {
    const { store } = opened;
    expect(driveAccess(robin, store.driveRoots.byId(ROBIN_DRIVE))).toBe('own');
    expect(driveAccess(robin, store.driveRoots.byId(HOME))).toBe('shared');
    expect(driveAccess(robin, store.driveRoots.byId(SAM_DRIVE))).toBe('none');
    expect(driveAccess(sam, store.driveRoots.byId(SAM_DRIVE))).toBe('own');
  });
});

describe('item access', () => {
  it('gives nobody but the person access to an unshared personal item, the hub owner included', () => {
    expect(accessTo(sam, TRIP_FILE)).toBe('own');
    expect(accessTo(robin, TRIP_FILE)).toBe('none');
    expect(accessTo(kim, OTHER_FILE)).toBe('none');
    expect(accessTo(robin, SHARED_FILE)).toBe('shared');
    expect(accessTo(robin, ROBIN_FILE)).toBe('own');
  });

  it('lets a grant on a folder cover everything inside it but not a sibling with the same prefix', () => {
    opened.store.driveGrants.set(
      { itemId: TRIP, profileId: robin.profileId, role: 'view' },
      sam.profileId,
    );
    expect(accessTo(robin, TRIP)).toBe('view');
    expect(accessTo(robin, TRIP_FILE)).toBe('view');
    expect(accessTo(robin, TRIP_DEEP)).toBe('view');
    expect(accessTo(robin, TRIPOD_FILE)).toBe('none');
    expect(accessTo(robin, OTHER_FILE)).toBe('none');
    expect(accessTo(kim, TRIP_FILE)).toBe('none');
  });

  it('lets a grant on a file cover only that file and takes the strongest of several grants', () => {
    const { driveGrants } = opened.store;
    driveGrants.set(
      { itemId: OTHER_FILE, profileId: robin.profileId, role: 'edit' },
      sam.profileId,
    );
    expect(accessTo(robin, OTHER_FILE)).toBe('edit');
    expect(accessTo(robin, TRIP_FILE)).toBe('none');
    driveGrants.set({ itemId: TRIP, profileId: robin.profileId, role: 'view' }, sam.profileId);
    driveGrants.set({ itemId: TRIP_FILE, profileId: robin.profileId, role: 'edit' }, sam.profileId);
    expect(accessTo(robin, TRIP_FILE)).toBe('edit');
    expect(accessTo(robin, TRIP_DEEP)).toBe('view');
  });

  it('ends cover when the grant is removed', () => {
    const grant = opened.store.driveGrants.set(
      { itemId: TRIP, profileId: robin.profileId, role: 'view' },
      sam.profileId,
    );
    opened.store.driveGrants.remove(grant.id);
    expect(accessTo(robin, TRIP_FILE)).toBe('none');
  });

  it('says what each level may do', () => {
    const levels: readonly ItemAccess[] = ['none', 'view', 'edit', 'shared', 'own'];
    expect(levels.map(canRead)).toEqual([false, true, true, true, true]);
    expect(levels.map(canWrite)).toEqual([false, false, true, true, true]);
    expect(levels.map(canShare)).toEqual([false, false, false, true, true]);
  });
});

describe('the SQL filter', () => {
  const NAMES = z.object({ id: z.string() });

  function reachable(actor: DriveActor): string[] {
    const filter = accessFilter(actor);
    return opened.store.context.sql
      .all(
        NAMES,
        `select i.id from drive_items i join drive_roots r on r.id = i.root_id
          where ${filter.text} order by i.id`,
        filter.parameters,
      )
      .map((row) => row.id);
  }

  function reachableByRule(actor: DriveActor): string[] {
    const ids = [
      TRIP,
      TRIP_FILE,
      id(8),
      TRIP_DEEP,
      id(9),
      TRIPOD_FILE,
      OTHER_FILE,
      SHARED_FILE,
      ROBIN_FILE,
    ];
    return ids.filter((itemId) => canRead(accessTo(actor, itemId))).sort();
  }

  it('agrees with the item rule for every person before and after grants', () => {
    for (const actor of [robin, sam, kim]) expect(reachable(actor)).toEqual(reachableByRule(actor));
    const { driveGrants } = opened.store;
    driveGrants.set({ itemId: TRIP, profileId: robin.profileId, role: 'view' }, sam.profileId);
    driveGrants.set({ itemId: OTHER_FILE, profileId: kim.profileId, role: 'edit' }, sam.profileId);
    for (const actor of [robin, sam, kim]) expect(reachable(actor)).toEqual(reachableByRule(actor));
    expect(reachable(robin)).toEqual(
      [SHARED_FILE, ROBIN_FILE, TRIP, TRIP_FILE, id(8), TRIP_DEEP].sort(),
    );
    expect(reachable(kim)).toEqual([SHARED_FILE, OTHER_FILE].sort());
  });

  it('limits a drive filter to whole drives the person can open', () => {
    const filter = driveFilter(robin);
    const ids = opened.store.context.sql
      .all(
        NAMES,
        `select r.id from drive_roots r where ${filter.text} order by r.id`,
        filter.parameters,
      )
      .map((row) => row.id);
    expect(ids).toEqual([HOME, ROBIN_DRIVE]);
  });
});

describe('albums', () => {
  it('shows home albums and the person’s own only', () => {
    const base = {
      id: id(50),
      title: 'x',
      surface: 'drive',
      coverItemId: null,
      itemCount: 0,
      createdAt: '2026-11-07T00:00:00.000Z',
      updatedAt: '2026-11-07T00:00:00.000Z',
      kind: 'manual',
    } as const;
    expect(albumVisibleTo(robin, { ...base, scope: 'home', ownerProfileId: null })).toBe(true);
    expect(
      albumVisibleTo(robin, { ...base, scope: 'person', ownerProfileId: robin.profileId }),
    ).toBe(true);
    expect(albumVisibleTo(robin, { ...base, scope: 'person', ownerProfileId: sam.profileId })).toBe(
      false,
    );
  });
});
