import type { DrivePlacement, LiveChange } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DriveGrants } from '../../src/drive/grants';
import { PlacementLifecycle } from '../../src/drive/placement-lifecycle';
import { GrantExpiry } from '../../src/drive/sharing/grant-expiry';
import { VIEW_ONLY_REASON } from '../../src/drive/sharing/export-guard';
import { DriveLocks } from '../../src/drive/sharing/locks';
import { captureLogs, testLogger } from '../support/logs';
import {
  MUSIC,
  ROBIN_DRIVE,
  ROBIN_TRIP,
  ROBIN_TRIP_DEEP,
  openPlacementWorld,
  place,
  type PlacementWorld,
} from './placement-fixture';

const START = new Date('2026-11-07T00:00:00.000Z');
const MINUTE = 60_000;

let world: PlacementWorld;
let clock = START;
let lifecycle: PlacementLifecycle;
let stop: () => void;
let expiry: GrantExpiry;
let stopExpiry: () => void;

function at(minutes: number): string {
  return new Date(START.getTime() + minutes * MINUTE).toISOString();
}

function elapse(minutes: number): void {
  clock = new Date(clock.getTime() + minutes * MINUTE);
  vi.setSystemTime(clock);
  vi.advanceTimersByTime(minutes * MINUTE);
}

function current(id: string): DrivePlacement {
  return world.store.drivePlacements.byId(id);
}

function grant(
  itemId: string,
  profileId: string,
  role: 'view' | 'edit',
  expiresAt: string | null,
): string {
  return world.store.driveGrants.set({ itemId, profileId, role, expiresAt }, world.robin.profileId)
    .id;
}

function grantIds(itemId: string): string[] {
  return world.store.driveGrants.forItem(itemId).map((row) => row.id);
}

beforeEach(async () => {
  vi.useFakeTimers({ now: START });
  clock = START;
  world = await openPlacementWorld();
  lifecycle = new PlacementLifecycle({
    store: world.store,
    placements: world.placements,
    now: (): string => clock.toISOString(),
    log: testLogger('placement-lifecycle'),
  });
  stop = lifecycle.start();
  expiry = new GrantExpiry({
    store: world.store,
    now: (): Date => clock,
    log: testLogger('drive'),
  });
  stopExpiry = expiry.start();
});

afterEach(async () => {
  stopExpiry();
  stop();
  vi.useRealTimers();
  await world.close();
});

describe('expiring access', () => {
  it('deletes exactly the expired grants at the moment they expire', () => {
    const soon = grant(ROBIN_TRIP, world.ida.profileId, 'view', at(10));
    const later = grant(ROBIN_TRIP_DEEP, world.ida.profileId, 'edit', at(30));
    const forever = grant(ROBIN_TRIP_DEEP, world.owner.profileId, 'view', null);
    elapse(9);
    expect(grantIds(ROBIN_TRIP)).toEqual([soon]);
    elapse(1);
    expect(grantIds(ROBIN_TRIP)).toEqual([]);
    expect(grantIds(ROBIN_TRIP_DEEP).sort()).toEqual([later, forever].sort());
    elapse(19);
    expect(grantIds(ROBIN_TRIP_DEEP).sort()).toEqual([later, forever].sort());
    elapse(1);
    expect(grantIds(ROBIN_TRIP_DEEP)).toEqual([forever]);
  });

  it('stores an offset expiry as a UTC instant and removes the grant at that instant', () => {
    const id = grant(ROBIN_TRIP, world.ida.profileId, 'view', '2026-11-07T07:10:00+07:00');
    expect(world.store.driveGrants.byId(id).expiresAt).toBe(at(10));
    const timers = vi.getTimerCount();
    elapse(9);
    expect(grantIds(ROBIN_TRIP)).toEqual([id]);
    expect(vi.getTimerCount()).toBe(timers);
    elapse(1);
    expect(grantIds(ROBIN_TRIP)).toEqual([]);
  });

  it('picks the soonest of grants given with different offsets', () => {
    const later = grant(ROBIN_TRIP, world.ida.profileId, 'view', '2026-11-07T07:20:00+07:00');
    const sooner = grant(ROBIN_TRIP_DEEP, world.ida.profileId, 'view', '2026-11-07T00:05:00Z');
    expect(world.store.driveGrants.nextExpiry()).toBe(at(5));
    elapse(5);
    expect(grantIds(ROBIN_TRIP_DEEP)).toEqual([]);
    expect(sooner).not.toBe(later);
    expect(grantIds(ROBIN_TRIP)).toEqual([later]);
    elapse(15);
    expect(grantIds(ROBIN_TRIP)).toEqual([]);
  });

  it('re-arms for a grant that expires sooner than the one already waiting', () => {
    const late = grant(ROBIN_TRIP, world.ida.profileId, 'view', at(60));
    const early = grant(ROBIN_TRIP_DEEP, world.ida.profileId, 'view', at(5));
    elapse(5);
    expect(grantIds(ROBIN_TRIP_DEEP)).toEqual([]);
    expect(grantIds(ROBIN_TRIP)).toEqual([late]);
    expect(early).not.toBe(late);
    elapse(55);
    expect(grantIds(ROBIN_TRIP)).toEqual([]);
  });

  it('re-arms when a grant is moved to a later date and when it is removed', () => {
    const id = grant(ROBIN_TRIP, world.ida.profileId, 'view', at(5));
    grant(ROBIN_TRIP, world.ida.profileId, 'view', at(20));
    elapse(6);
    expect(grantIds(ROBIN_TRIP)).toEqual([id]);
    world.store.driveGrants.remove(id);
    expect(() => {
      elapse(60);
    }).not.toThrow();
    expect(grantIds(ROBIN_TRIP)).toEqual([]);
  });

  it('removes grants that expired while the hub was off when it starts', () => {
    stopExpiry();
    const missed = grant(ROBIN_TRIP, world.ida.profileId, 'view', at(5));
    clock = new Date(START.getTime() + 20 * MINUTE);
    vi.setSystemTime(clock);
    expect(grantIds(ROBIN_TRIP)).toEqual([missed]);
    stopExpiry = expiry.start();
    expect(grantIds(ROBIN_TRIP)).toEqual([]);
  });

  it('puts the placement of an expired grant on the no access hold', () => {
    grant(ROBIN_TRIP, world.ida.profileId, 'view', at(10));
    const placed = place(world, world.ida, world.idaDesk, {
      rootId: ROBIN_DRIVE,
      folderItemId: ROBIN_TRIP,
    });
    expect(current(placed.id).hold).toBeNull();
    elapse(10);
    expect(current(placed.id)).toMatchObject({ hold: 'no_access' });
  });

  it('logs every expired grant', () => {
    const logs = captureLogs();
    grant(ROBIN_TRIP, world.ida.profileId, 'view', at(1));
    elapse(1);
    expect(logs.events()).toContain('drive.grant_expired');
  });
});

describe('view only protection of placements', () => {
  function lockTrip(locked: boolean): void {
    const locks = new DriveLocks({ store: world.store });
    locks.set(world.robin, { itemId: ROBIN_TRIP, locked });
  }

  it('refuses a view grantee a placement of a locked folder', () => {
    grant(ROBIN_TRIP, world.ida.profileId, 'view', null);
    lockTrip(true);
    let refused: unknown;
    try {
      place(world, world.ida, world.idaDesk, { rootId: ROBIN_DRIVE, folderItemId: ROBIN_TRIP });
    } catch (cause) {
      refused = cause;
    }
    expect(refused).toMatchObject({ reason: VIEW_ONLY_REASON });
  });

  it('lets an edit grantee place a locked folder', () => {
    grant(ROBIN_TRIP, world.ida.profileId, 'edit', null);
    lockTrip(true);
    const placed = place(world, world.ida, world.idaDesk, {
      rootId: ROBIN_DRIVE,
      folderItemId: ROBIN_TRIP,
    });
    expect(placed.hold).toBeNull();
  });

  it('puts an existing placement on the no access hold when the folder is locked and frees it again', async () => {
    grant(ROBIN_TRIP, world.ida.profileId, 'view', null);
    const placed = place(world, world.ida, world.idaDesk, {
      rootId: ROBIN_DRIVE,
      folderItemId: ROBIN_TRIP,
    });
    expect(current(placed.id).hold).toBeNull();
    lockTrip(true);
    await vi.advanceTimersByTimeAsync(0);
    await lifecycle.settled();
    expect(current(placed.id)).toMatchObject({ hold: 'no_access' });
    lockTrip(false);
    await vi.advanceTimersByTimeAsync(0);
    await lifecycle.settled();
    expect(current(placed.id)).toMatchObject({ hold: null });
  });

  it('never holds the owner own placement of a locked folder', () => {
    lockTrip(true);
    const placed = place(world, world.robin, world.robinDesk, {
      rootId: ROBIN_DRIVE,
      folderItemId: ROBIN_TRIP,
    });
    expect(current(placed.id).hold).toBeNull();
  });
});

describe('making an item view only', () => {
  it('locks and unlocks an item of the caller own drive and covers what is inside', () => {
    const locks = new DriveLocks({ store: world.store });
    const locked = locks.set(world.robin, { itemId: ROBIN_TRIP, locked: true });
    expect(locked.locked).toBe(true);
    expect(world.store.driveItems.byId(ROBIN_TRIP_DEEP, world.robin.profileId).locked).toBe(true);
    const lifted = locks.set(world.robin, { itemId: ROBIN_TRIP, locked: false });
    expect(lifted.locked).toBe(false);
    expect(world.store.driveItems.byId(ROBIN_TRIP_DEEP, world.robin.profileId).locked).toBe(false);
  });

  it('tells the live layer which drive and folders changed', () => {
    const notices: unknown[] = [];
    world.store.feed.subscribeNotices((notice) => {
      if (notice.type === 'drive_changed') notices.push(notice);
    });
    new DriveLocks({ store: world.store }).set(world.robin, { itemId: ROBIN_TRIP, locked: true });
    expect(notices).toMatchObject([{ rootIds: [ROBIN_DRIVE], folderIds: [ROBIN_TRIP] }]);
  });

  it('refuses everyone but the person whose drive it is, and the Shared Drive', () => {
    const locks = new DriveLocks({ store: world.store });
    grant(ROBIN_TRIP, world.ida.profileId, 'edit', null);
    expect(() => locks.set(world.ida, { itemId: ROBIN_TRIP, locked: true })).toThrow(
      /only the person/iu,
    );
    expect(() => locks.set(world.owner, { itemId: ROBIN_TRIP, locked: true })).toThrow(
      /no such file/iu,
    );
    expect(() => locks.set(world.owner, { itemId: MUSIC, locked: true })).toThrow(/Shared Drive/u);
    expect(world.store.driveItems.byId(MUSIC, world.owner.profileId).locked).toBe(false);
  });
});

describe('sharing notifications', () => {
  it('tells a person once that something was shared with them and not again for a change', () => {
    const grants = new DriveGrants({ store: world.store });
    grants.set(world.robin, {
      itemId: ROBIN_TRIP,
      profileId: world.ida.profileId,
      role: 'view',
      expiresAt: null,
    });
    grants.set(world.robin, {
      itemId: ROBIN_TRIP,
      profileId: world.ida.profileId,
      role: 'edit',
      expiresAt: null,
    });
    const inbox = world.store.driveNotifications.list(world.ida.profileId, null, 10);
    expect(inbox.notifications).toHaveLength(1);
    expect(inbox.notifications[0]).toMatchObject({
      kind: 'shared',
      itemId: ROBIN_TRIP,
      actorProfileId: world.robin.profileId,
      count: 1,
    });
  });

  it('adds one live row only when a notification is created and not when it is coalesced', () => {
    const rows: LiveChange[] = [];
    world.store.feed.subscribe((change) => {
      if (change.table === 'drive_notifications') rows.push(change);
    });
    const grants = new DriveGrants({ store: world.store });
    grants.set(world.robin, {
      itemId: ROBIN_TRIP,
      profileId: world.ida.profileId,
      role: 'view',
      expiresAt: null,
    });
    grants.remove(world.robin, world.store.driveGrants.forItem(ROBIN_TRIP)[0]?.id ?? '');
    grants.set(world.robin, {
      itemId: ROBIN_TRIP,
      profileId: world.ida.profileId,
      role: 'view',
      expiresAt: null,
    });
    expect(rows.map((row) => row.operation)).toEqual(['INSERT', 'UPDATE']);
  });
});
