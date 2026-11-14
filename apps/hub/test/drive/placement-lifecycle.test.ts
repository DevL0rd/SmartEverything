import type { DrivePlacement, DriveTrashEntry } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HOLD_REASONS, PlacementLifecycle } from '../../src/drive/placement-lifecycle';
import { testLogger } from '../support/logs';
import { putItem } from './spaces-fixture';
import {
  HOME_DRIVE,
  IDA_DRIVE,
  MUSIC,
  ROBIN_DRIVE,
  ROBIN_TRIP,
  ROBIN_TRIP_DEEP,
  ROMS,
  ROMS_INNER,
  openPlacementWorld,
  place,
  type PlacementWorld,
} from './placement-fixture';

const COPY = '0f000000-0000-4000-8000-0000000000c1';
const NOW = '2026-11-07T00:00:00.000Z';

let world: PlacementWorld;
let lifecycle: PlacementLifecycle;
let stop: () => void;

function current(id: string): DrivePlacement {
  return world.store.drivePlacements.byId(id);
}

function announce(...rootIds: string[]): void {
  world.store.feed.notice({
    type: 'drive_changed',
    rootIds,
    folderIds: [],
    albumIds: [],
    months: [],
    cursor: 0,
  });
}

function entryOf(itemId: string, rootId: string, relPath: string): DriveTrashEntry {
  return {
    itemId,
    rootId,
    name: relPath,
    originalRelPath: relPath,
    trashRelPath: `.trash/${itemId}`,
    isFolder: true,
    bytes: 0,
    deletedAt: NOW,
    purgeAt: '2026-12-07T00:00:00.000Z',
    deletedBy: null,
    addedByProfileId: null,
  };
}

function trashFolder(itemId: string, rootId: string, relPath: string): void {
  world.store.context.write(() => {
    world.store.driveTrash.insert(entryOf(itemId, rootId, relPath));
    world.store.driveItems.remove(itemId);
    announce(rootId);
  });
}

function restoreFolder(itemId: string, rootId: string, relPath: string): void {
  world.store.context.write(() => {
    world.store.driveTrash.remove(itemId);
    putItem(world.store, { rootId, id: itemId, relPath, kind: 'folder' });
    announce(rootId);
  });
}

function purgeFolder(itemId: string): void {
  world.store.context.write(() => {
    world.store.driveTrash.remove(itemId);
    announce(HOME_DRIVE, ROBIN_DRIVE, IDA_DRIVE);
  });
}

function share(itemId: string, profileId: string, role: 'view' | 'edit'): void {
  world.store.driveGrants.set({ itemId, profileId, role }, world.robin.profileId);
}

beforeEach(async () => {
  world = await openPlacementWorld();
  lifecycle = new PlacementLifecycle({
    store: world.store,
    placements: world.placements,
    now: (): string => NOW,
    log: testLogger('placement-lifecycle'),
  });
  stop = lifecycle.start();
});

afterEach(async () => {
  stop();
  await world.close();
});

describe('trash', () => {
  it('holds a placement whose folder is trashed and clears the hold on restore', () => {
    const placed = place(world, world.owner, world.ownerDesk, { folderItemId: ROMS });
    trashFolder(ROMS, HOME_DRIVE, 'Roms');
    expect(current(placed.id)).toMatchObject({
      hold: 'trashed',
      status: { state: 'stopped', reason: 'Folder is in the trash' },
    });
    restoreFolder(ROMS, HOME_DRIVE, 'Roms');
    expect(current(placed.id)).toMatchObject({
      hold: null,
      status: { state: 'starting', reason: null },
    });
  });

  it('holds a placement whose ancestor is trashed', () => {
    const placed = place(world, world.owner, world.ownerDesk, { folderItemId: ROMS_INNER });
    trashFolder(ROMS, HOME_DRIVE, 'Roms');
    expect(world.store.driveItems.find(ROMS_INNER, null)).toBeUndefined();
    expect(current(placed.id)).toMatchObject({ hold: 'trashed' });
    expect(current(placed.id).status.reason).toBe(HOLD_REASONS.trashed);
  });

  it('keeps the other placements of the drive untouched', () => {
    const music = place(world, world.owner, world.ownerDesk, {
      folderItemId: MUSIC,
      localPath: '/home/owner/Music',
    });
    place(world, world.owner, world.ownerDesk, { folderItemId: ROMS });
    trashFolder(ROMS, HOME_DRIVE, 'Roms');
    expect(current(music.id).hold).toBeNull();
  });
});

describe('purge', () => {
  it('removes the row of a placement whose folder was purged from the trash', () => {
    const placed = place(world, world.owner, world.ownerDesk, { folderItemId: ROMS });
    trashFolder(ROMS, HOME_DRIVE, 'Roms');
    purgeFolder(ROMS);
    expect(world.store.drivePlacements.find(placed.id)).toBeUndefined();
  });

  it('removes the row of a nested placement when its trashed ancestor is purged', () => {
    const placed = place(world, world.owner, world.ownerDesk, { folderItemId: ROMS_INNER });
    trashFolder(ROMS, HOME_DRIVE, 'Roms');
    purgeFolder(ROMS);
    expect(world.store.drivePlacements.find(placed.id)).toBeUndefined();
  });
});

describe('access', () => {
  it('holds a placement when a grant is removed and releases it when access is back', () => {
    share(ROBIN_TRIP, world.ida.profileId, 'edit');
    const placed = place(world, world.ida, world.idaDesk, {
      rootId: ROBIN_DRIVE,
      folderItemId: ROBIN_TRIP,
      localPath: '/home/ida/Trip',
    });
    const grant = world.store.driveGrants.forPerson(ROBIN_TRIP, world.ida.profileId);
    world.store.driveGrants.remove(grant?.id ?? '');
    expect(current(placed.id)).toMatchObject({
      hold: 'no_access',
      status: { state: 'stopped', reason: 'No access to this folder any more' },
    });
    share(ROBIN_TRIP, world.ida.profileId, 'edit');
    expect(current(placed.id)).toMatchObject({ hold: null, status: { state: 'starting' } });
  });

  it('holds a placement on an item moved out of the shared folder', () => {
    share(ROBIN_TRIP, world.ida.profileId, 'view');
    const placed = place(world, world.ida, world.idaDesk, {
      rootId: ROBIN_DRIVE,
      folderItemId: ROBIN_TRIP_DEEP,
      localPath: '/home/ida/Photos',
    });
    expect(placed.status.readOnly).toBe(true);
    world.store.context.write(() => {
      world.store.driveItems.remove(ROBIN_TRIP_DEEP);
      putItem(world.store, {
        rootId: ROBIN_DRIVE,
        id: ROBIN_TRIP_DEEP,
        relPath: 'Photos',
        kind: 'folder',
      });
      announce(ROBIN_DRIVE);
    });
    expect(current(placed.id)).toMatchObject({ hold: 'no_access' });
  });
});

describe('read only', () => {
  it('follows a grant changing from edit to view and back', () => {
    share(ROBIN_TRIP, world.ida.profileId, 'edit');
    const placed = place(world, world.ida, world.idaDesk, {
      rootId: ROBIN_DRIVE,
      folderItemId: ROBIN_TRIP,
      localPath: '/home/ida/Trip',
    });
    expect(current(placed.id).status.readOnly).toBe(false);
    share(ROBIN_TRIP, world.ida.profileId, 'view');
    expect(current(placed.id).status.readOnly).toBe(true);
    share(ROBIN_TRIP, world.ida.profileId, 'edit');
    expect(current(placed.id).status.readOnly).toBe(false);
  });

  it('sends the computer the new placement when the access changes', () => {
    share(ROBIN_TRIP, world.ida.profileId, 'edit');
    place(world, world.ida, world.idaDesk, {
      rootId: ROBIN_DRIVE,
      folderItemId: ROBIN_TRIP,
      localPath: '/home/ida/Trip',
    });
    const heard: (readonly string[])[] = [];
    world.placements.onDeviceChanged((deviceIds) => heard.push(deviceIds));
    share(ROBIN_TRIP, world.ida.profileId, 'view');
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(heard).toEqual([[world.idaDesk]]);
        resolve();
      }, 0);
    });
  });
});

describe('computer', () => {
  it('removes the rows of an unpaired computer and keeps the others', () => {
    const gone = place(world, world.owner, world.ownerDesk);
    const kept = place(world, world.ida, world.idaDesk, { rootId: IDA_DRIVE });
    world.store.computerNodes.revoke(world.ownerDesk);
    lifecycle.deviceUnpaired(world.ownerDesk);
    expect(world.store.drivePlacements.find(gone.id)).toBeUndefined();
    expect(world.store.drivePlacements.find(kept.id)).toBeDefined();
  });
});

describe('copies', () => {
  it('leaves the placement on the original when a copy appears in another drive', () => {
    const placed = place(world, world.owner, world.ownerDesk, { folderItemId: ROMS });
    putItem(world.store, { rootId: ROBIN_DRIVE, id: COPY, relPath: 'Roms', kind: 'folder' });
    announce(HOME_DRIVE, ROBIN_DRIVE);
    expect(current(placed.id)).toMatchObject({
      rootId: HOME_DRIVE,
      folderItemId: ROMS,
      hold: null,
    });
    expect(world.store.drivePlacements.forFolder(COPY)).toEqual([]);
  });
});

describe('held rows', () => {
  it('are not in activeFor while held and return when released', () => {
    const placed = place(world, world.owner, world.ownerDesk, { folderItemId: ROMS });
    expect(world.placements.activeFor(world.ownerDesk).map((one) => one.id)).toEqual([placed.id]);
    trashFolder(ROMS, HOME_DRIVE, 'Roms');
    expect(world.placements.activeFor(world.ownerDesk)).toEqual([]);
    expect(world.store.drivePlacements.forDevice(world.ownerDesk).map((one) => one.id)).toEqual([
      placed.id,
    ]);
    restoreFolder(ROMS, HOME_DRIVE, 'Roms');
    expect(world.placements.activeFor(world.ownerDesk).map((one) => one.id)).toEqual([placed.id]);
  });
});
