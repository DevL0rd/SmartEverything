import { randomBytes } from 'node:crypto';
import {
  DRIVE_PLACEMENT_SET,
  type DrivePlacement,
  type DrivePlacementSet,
  type DrivePlacementStatus,
} from '@smarteverything/domain';
import type { DriveActor } from '../../src/drive/access';
import { DrivePlacements } from '../../src/drive/placements';
import type { Store } from '../../src/store/store';
import { personalDriveRoot, sharedDriveRoot } from '../store/drive-roots-fixture';
import type { TestStore } from '../support/store';
import { driveTestStore, putItem } from './spaces-fixture';

export const HOME_DRIVE = '0d000000-0000-4000-8000-000000000001';
export const OWNER_DRIVE = '0d000000-0000-4000-8000-000000000002';
export const ROBIN_DRIVE = '0d000000-0000-4000-8000-000000000003';
export const IDA_DRIVE = '0d000000-0000-4000-8000-000000000004';

export const ROMS = '0f000000-0000-4000-8000-000000000001';
export const ROMS_INNER = '0f000000-0000-4000-8000-000000000002';
export const MUSIC = '0f000000-0000-4000-8000-000000000003';
export const NOTES = '0f000000-0000-4000-8000-000000000004';
export const OWNER_DOCS = '0f000000-0000-4000-8000-000000000005';
export const ROBIN_TRIP = '0f000000-0000-4000-8000-000000000006';
export const ROBIN_TRIP_DEEP = '0f000000-0000-4000-8000-000000000007';
export const ROBIN_PRIVATE = '0f000000-0000-4000-8000-000000000008';
export const IDA_PRIVATE = '0f000000-0000-4000-8000-000000000009';

export const LATER = '2026-11-08T00:00:00.000Z';

export interface PlacementWorld {
  readonly test: TestStore;
  readonly store: Store;
  readonly placements: DrivePlacements;
  readonly owner: DriveActor;
  readonly robin: DriveActor;
  readonly ida: DriveActor;
  readonly ownerDesk: string;
  readonly robinDesk: string;
  readonly secondRobinDesk: string;
  readonly idaDesk: string;
  readonly close: () => Promise<void>;
}

let idCounter = 0;
let nodeCount = 0;

export function newId(): string {
  idCounter += 1;
  return `0a000000-0000-4000-8000-${idCounter.toString(16).padStart(12, '0')}`;
}

export function pairComputer(store: Store, profileId: string | null): string {
  nodeCount += 1;
  const [device] = store.devices.upsert([
    {
      provider: 'local',
      externalId: `computer:placements:${String(nodeCount)}`,
      parentId: null,
      kind: 'computer',
      name: `Desk ${String(nodeCount)}`,
      model: 'model',
      manufacturer: 'Maker',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details: {},
    },
  ]);
  if (device === undefined) throw new Error('the device was not stored');
  store.computerNodes.bind({
    deviceId: device.id,
    machineId: nodeCount.toString(16).padStart(32, '0'),
    tokenHash: randomBytes(32).toString('hex'),
    hubUrl: 'http://hub.test',
    windowClientId: null,
    profileId,
  });
  return device.id;
}

export async function openPlacementWorld(): Promise<PlacementWorld> {
  idCounter = 0;
  const test = await driveTestStore();
  const { store } = test;
  const owner: DriveActor = { profileId: store.profiles.first().id };
  const robin: DriveActor = { profileId: store.profiles.create({ name: 'Robin' }).id };
  const ida: DriveActor = { profileId: store.profiles.create({ name: 'Ida' }).id };
  store.driveRoots.insert(sharedDriveRoot(HOME_DRIVE));
  store.driveRoots.insert(personalDriveRoot(OWNER_DRIVE, owner.profileId));
  store.driveRoots.insert(personalDriveRoot(ROBIN_DRIVE, robin.profileId));
  store.driveRoots.insert(personalDriveRoot(IDA_DRIVE, ida.profileId));
  putItem(store, { rootId: HOME_DRIVE, id: ROMS, relPath: 'Roms', kind: 'folder' });
  putItem(store, { rootId: HOME_DRIVE, id: ROMS_INNER, relPath: 'Roms/Inner', kind: 'folder' });
  putItem(store, { rootId: HOME_DRIVE, id: MUSIC, relPath: 'Music', kind: 'folder' });
  putItem(store, { rootId: HOME_DRIVE, id: NOTES, relPath: 'notes.txt', kind: 'document' });
  putItem(store, { rootId: OWNER_DRIVE, id: OWNER_DOCS, relPath: 'Docs', kind: 'folder' });
  putItem(store, { rootId: ROBIN_DRIVE, id: ROBIN_TRIP, relPath: 'Trip', kind: 'folder' });
  putItem(store, {
    rootId: ROBIN_DRIVE,
    id: ROBIN_TRIP_DEEP,
    relPath: 'Trip/Photos',
    kind: 'folder',
  });
  putItem(store, { rootId: ROBIN_DRIVE, id: ROBIN_PRIVATE, relPath: 'Private', kind: 'folder' });
  putItem(store, { rootId: IDA_DRIVE, id: IDA_PRIVATE, relPath: 'Private', kind: 'folder' });
  const placements = new DrivePlacements({ store, context: store.context, newId });
  return {
    test,
    store,
    placements,
    owner,
    robin,
    ida,
    ownerDesk: pairComputer(store, owner.profileId),
    robinDesk: pairComputer(store, robin.profileId),
    secondRobinDesk: pairComputer(store, robin.profileId),
    idaDesk: pairComputer(store, ida.profileId),
    close: () => test.close(),
  };
}

export function placementRequest(
  deviceId: string,
  fields: Partial<DrivePlacementSet> = {},
): DrivePlacementSet {
  const mode = fields.mode ?? 'mounted';
  return DRIVE_PLACEMENT_SET.parse({
    deviceId,
    rootId: HOME_DRIVE,
    folderItemId: null,
    mode,
    localPath: '/home/robin/Games',
    enabled: true,
    ...(mode === 'synced' ? { excluded: [], ignorePatterns: [], conflictCopies: false } : {}),
    ...fields,
  });
}

export function status(fields: Partial<DrivePlacementStatus> = {}): DrivePlacementStatus {
  return {
    state: 'mounted',
    tier: 'full',
    basicLimits: null,
    readOnly: false,
    route: 'local',
    cacheBytes: 10,
    pinnedBytes: 2,
    openFiles: 1,
    pendingUploads: 0,
    needBytes: 0,
    lastSyncedAt: null,
    errors: [],
    reason: null,
    reportedAt: LATER,
    ...fields,
  };
}

export function place(
  world: PlacementWorld,
  actor: DriveActor,
  deviceId: string,
  fields: Partial<DrivePlacementSet> = {},
): DrivePlacement {
  return world.placements.set(actor, placementRequest(deviceId, fields));
}
