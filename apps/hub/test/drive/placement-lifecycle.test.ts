import { randomBytes } from 'node:crypto';
import {
  DRIVE_PLACEMENT_SET,
  type DrivePlacement,
  type DrivePlacementSet,
  type DriveTrashEntry,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HOLD_REASONS, PlacementLifecycle } from '../../src/drive/placement-lifecycle';
import { DrivePlacements } from '../../src/drive/placements';
import type { DriveActor } from '../../src/drive/service-read';
import { ComputerNodesRepository } from '../../src/store/repositories/computer-nodes';
import { DevicesRepository } from '../../src/store/repositories/devices';
import { DriveTrashRepository } from '../../src/store/repositories/drive-trash';
import { DrivePlacementsRepository } from '../../src/store/repositories/drive-placements';
import { ProfilesRepository } from '../../src/store/repositories/profiles';
import { UNSYNCED } from '../../src/store/repositories/drive-roots';
import { testLogger } from '../support/logs';
import { folderRoot, NOW, openDriveFixture, type DriveFixture } from './drive-fixture';

const HOME_ROOT = '0d000000-0000-4000-8000-000000000001';
const SYNCED_ROOT = '0d000000-0000-4000-8000-000000000002';
const OTHER_ROOT = '0d000000-0000-4000-8000-000000000003';
const PERSON_ROOT = '0d000000-0000-4000-8000-000000000004';
const ROMS = '0f000000-0000-4000-8000-000000000001';
const SNES = '0f000000-0000-4000-8000-000000000002';
const MUSIC = '0f000000-0000-4000-8000-000000000003';
const OTHER_FOLDER = '0f000000-0000-4000-8000-000000000005';
const COPY = '0f000000-0000-4000-8000-000000000007';

let fixture: DriveFixture;
let placements: DrivePlacements;
let repository: DrivePlacementsRepository;
let trash: DriveTrashRepository;
let nodes: ComputerNodesRepository;
let devices: DevicesRepository;
let owner: DriveActor;
let idaId: string;
let robinId: string;
let ownerDesk: string;
let idaDesk: string;
let idaActsAs: string;
let lifecycle: PlacementLifecycle;
let stop: () => void;
let idCounter = 0;
let nodeCount = 0;

function newId(): string {
  idCounter += 1;
  return `0a000000-0000-4000-8000-${idCounter.toString(16).padStart(12, '0')}`;
}

function pair(profileId: string): string {
  nodeCount += 1;
  const [device] = devices.upsert([
    {
      provider: 'local',
      externalId: `computer:lifecycle:${String(nodeCount)}`,
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
  nodes.bind({
    deviceId: device.id,
    machineId: nodeCount.toString(16).padStart(32, '0'),
    tokenHash: randomBytes(32).toString('hex'),
    hubUrl: 'http://hub.test',
    windowClientId: null,
    profileId,
  });
  return device.id;
}

function folder(id: string, rootId: string, name: string, parentId: string | null): void {
  fixture.items.write({
    item: {
      modifiedAt: NOW,
      addedAt: NOW,
      starred: false,
      outside: false,
      remoteId: null,
      remoteRev: null,
      id,
      rootId,
      parentId,
      relPath: name,
      name,
      kind: 'folder',
      childCount: 0,
      bytes: 0,
      addedByProfileId: null,
    },
    identity: { dev: '1', ino: id.slice(-4) },
  });
}

function request(deviceId: string, fields: Partial<DrivePlacementSet> = {}): DrivePlacementSet {
  return DRIVE_PLACEMENT_SET.parse({
    deviceId,
    rootId: HOME_ROOT,
    folderItemId: null,
    mode: 'mounted',
    localPath: '/home/robin/Games',
    enabled: true,
    ...fields,
  });
}

function place(deviceId: string, fields: Partial<DrivePlacementSet> = {}): DrivePlacement {
  return placements.set(owner, request(deviceId, fields));
}

function current(id: string): DrivePlacement {
  return repository.byId(id);
}

function announce(...rootIds: string[]): void {
  fixture.feed.notice({
    type: 'drive_changed',
    rootIds,
    folderIds: [],
    albumIds: [],
    months: [],
    cursor: 0,
  });
}

function entryOf(itemId: string, rootId: string): DriveTrashEntry {
  return {
    itemId,
    rootId,
    name: 'Roms',
    originalRelPath: 'Roms',
    trashRelPath: `.trash/${itemId}`,
    isFolder: true,
    bytes: 0,
    deletedAt: NOW,
    purgeAt: '2026-12-07T00:00:00.000Z',
    deletedBy: null,
    addedByProfileId: null,
  };
}

function trashFolder(itemId: string, rootId: string): void {
  fixture.context.write(() => {
    trash.insert(entryOf(itemId, rootId));
    fixture.items.remove(itemId);
    announce(rootId);
  });
}

function restoreFolder(itemId: string, rootId: string, name: string): void {
  fixture.context.write(() => {
    trash.remove(itemId);
    folder(itemId, rootId, name, null);
    announce(rootId);
  });
}

function purgeFolder(itemId: string): void {
  fixture.context.write(() => {
    trash.remove(itemId);
    announce(HOME_ROOT, SYNCED_ROOT, OTHER_ROOT, PERSON_ROOT);
  });
}

beforeEach(() => {
  fixture = openDriveFixture();
  const { context } = fixture;
  const profiles = new ProfilesRepository(context);
  devices = new DevicesRepository(context);
  nodes = new ComputerNodesRepository(context);
  repository = new DrivePlacementsRepository(context);
  trash = new DriveTrashRepository(context);
  const ownerId = profiles.first().id;
  robinId = profiles.create({ name: 'Robin' }).id;
  idaId = profiles.create({ name: 'Ida' }).id;
  idaActsAs = idaId;
  owner = { profileId: ownerId, owner: true };
  ownerDesk = pair(ownerId);
  idaDesk = pair(idaId);
  fixture.roots.insert(folderRoot(HOME_ROOT, '/srv/home', { readOnly: false, label: 'Shared' }));
  fixture.roots.insert(
    folderRoot(SYNCED_ROOT, '/srv/synced', {
      readOnly: false,
      label: 'Docs',
      synced: true,
      sync: UNSYNCED,
    }),
  );
  fixture.roots.insert(folderRoot(OTHER_ROOT, '/srv/other', { label: 'Archive' }));
  fixture.roots.insert(
    folderRoot(PERSON_ROOT, '/srv/person', {
      label: 'Ida',
      scope: 'person',
      ownerProfileId: idaId,
      readOnly: false,
    }),
  );
  folder(ROMS, HOME_ROOT, 'Roms', null);
  folder(SNES, HOME_ROOT, 'Snes', ROMS);
  folder(MUSIC, HOME_ROOT, 'Music', null);
  folder(OTHER_FOLDER, OTHER_ROOT, 'Old', null);
  idCounter = 0;
  const nodeActor = (deviceId: string): DriveActor => {
    if (deviceId === idaDesk) return { profileId: idaActsAs, owner: false };
    return owner;
  };
  placements = new DrivePlacements({
    store: {
      drivePlacements: repository,
      driveRoots: fixture.roots,
      driveItems: fixture.items,
      computerNodes: nodes,
    },
    context,
    nodeActor,
    newId,
  });
  lifecycle = new PlacementLifecycle({
    store: {
      drivePlacements: repository,
      driveRoots: fixture.roots,
      driveItems: fixture.items,
      driveTrash: trash,
      computerNodes: nodes,
      feed: fixture.feed,
    },
    placements,
    nodeActor,
    now: (): string => NOW,
    log: testLogger('placement-lifecycle'),
  });
  stop = lifecycle.start();
});

afterEach(() => {
  stop();
  fixture.database.close();
});

describe('trash', () => {
  it('holds a placement whose folder is trashed and clears the hold on restore', () => {
    const placed = place(ownerDesk, { folderItemId: ROMS });
    trashFolder(ROMS, HOME_ROOT);
    expect(current(placed.id)).toMatchObject({
      hold: 'trashed',
      status: { state: 'stopped', reason: 'Folder is in the trash' },
    });
    restoreFolder(ROMS, HOME_ROOT, 'Roms');
    expect(current(placed.id)).toMatchObject({
      hold: null,
      status: { state: 'starting', reason: null },
    });
  });

  it('holds a placement whose ancestor is trashed', () => {
    const placed = place(ownerDesk, { folderItemId: SNES });
    trashFolder(ROMS, HOME_ROOT);
    expect(fixture.items.find(SNES)).toBeUndefined();
    expect(current(placed.id)).toMatchObject({ hold: 'trashed' });
    expect(current(placed.id).status.reason).toBe(HOLD_REASONS.trashed);
  });

  it('keeps the other placements of the root untouched', () => {
    const music = place(ownerDesk, { folderItemId: MUSIC, localPath: '/home/robin/Music' });
    place(ownerDesk, { folderItemId: ROMS });
    trashFolder(ROMS, HOME_ROOT);
    expect(current(music.id).hold).toBeNull();
  });
});

describe('purge and removal', () => {
  it('removes the row of a placement whose folder was purged from the trash', () => {
    const placed = place(ownerDesk, { folderItemId: ROMS });
    trashFolder(ROMS, HOME_ROOT);
    purgeFolder(ROMS);
    expect(repository.find(placed.id)).toBeUndefined();
  });

  it('removes the row of a nested placement when its trashed ancestor is purged', () => {
    const placed = place(ownerDesk, { folderItemId: SNES });
    trashFolder(ROMS, HOME_ROOT);
    purgeFolder(ROMS);
    expect(repository.find(placed.id)).toBeUndefined();
  });

  it('removes the rows of a removed root and publishes the deletion', () => {
    const placed = place(ownerDesk);
    const other = place(ownerDesk, { rootId: OTHER_ROOT, localPath: '/home/robin/Old' });
    const deletions: string[] = [];
    fixture.feed.subscribe((change) => {
      if (change.table === 'drive_placements' && change.operation === 'DELETE') {
        deletions.push(change.oldRecord?.id ?? '');
      }
    });
    fixture.roots.remove(HOME_ROOT);
    expect(repository.find(placed.id)).toBeUndefined();
    expect(deletions).toEqual([placed.id]);
    expect(repository.find(other.id)).toBeDefined();
  });
});

describe('access', () => {
  it('holds a placement when the root is no longer visible to the person and releases it when access is back', () => {
    const placed = placements.set(
      owner,
      request(idaDesk, { rootId: PERSON_ROOT, localPath: '/home/ida/Private' }),
    );
    idaActsAs = robinId;
    fixture.roots.update(PERSON_ROOT, { label: 'Ida private' });
    expect(current(placed.id)).toMatchObject({
      hold: 'no_access',
      status: { state: 'stopped', reason: 'No access to this folder any more' },
    });
    idaActsAs = idaId;
    fixture.roots.update(PERSON_ROOT, { label: 'Ida' });
    expect(current(placed.id)).toMatchObject({ hold: null, status: { state: 'starting' } });
  });
});

describe('sync switch', () => {
  it('holds only the synced placements of a root whose sync turned off, and releases them on sync on', () => {
    const synced = place(ownerDesk, {
      rootId: SYNCED_ROOT,
      mode: 'synced',
      localPath: '/home/robin/Docs',
    });
    const mounted = place(idaDesk, {
      rootId: SYNCED_ROOT,
      mode: 'mounted',
      localPath: '/home/ida/Docs',
    });
    fixture.roots.update(SYNCED_ROOT, { sync: null });
    expect(current(synced.id)).toMatchObject({
      hold: 'sync_off',
      status: { state: 'stopped', reason: 'Sync is off for this folder' },
    });
    expect(current(mounted.id).hold).toBeNull();
    fixture.roots.update(SYNCED_ROOT, { sync: UNSYNCED });
    expect(current(synced.id)).toMatchObject({ hold: null });
  });
});

describe('computer', () => {
  it('removes the rows of an unpaired computer and keeps the others', () => {
    const gone = place(ownerDesk);
    const kept = placements.set(
      owner,
      request(idaDesk, { rootId: PERSON_ROOT, localPath: '/home/ida/Private' }),
    );
    nodes.revoke(ownerDesk);
    lifecycle.deviceUnpaired(ownerDesk);
    expect(repository.find(gone.id)).toBeUndefined();
    expect(repository.find(kept.id)).toBeDefined();
  });
});

describe('copies', () => {
  it('leaves the placement on the original when a copy appears in another root', () => {
    const placed = place(ownerDesk, { folderItemId: ROMS });
    folder(COPY, OTHER_ROOT, 'Roms', null);
    announce(HOME_ROOT, OTHER_ROOT);
    expect(current(placed.id)).toMatchObject({ rootId: HOME_ROOT, folderItemId: ROMS, hold: null });
    expect(repository.forFolder(COPY)).toEqual([]);
  });
});

describe('held rows', () => {
  it('are not in activeFor while held and return when released', () => {
    const placed = place(ownerDesk, { folderItemId: ROMS });
    expect(placements.activeFor(ownerDesk).map((one) => one.id)).toEqual([placed.id]);
    trashFolder(ROMS, HOME_ROOT);
    expect(placements.activeFor(ownerDesk)).toEqual([]);
    expect(repository.forDevice(ownerDesk).map((one) => one.id)).toEqual([placed.id]);
    restoreFolder(ROMS, HOME_ROOT, 'Roms');
    expect(placements.activeFor(ownerDesk).map((one) => one.id)).toEqual([placed.id]);
  });
});
