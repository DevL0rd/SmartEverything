import { randomBytes } from 'node:crypto';
import {
  DRIVE_PLACEMENT_SET,
  type HubFrame,
  type DrivePlacementSet,
  type DrivePlacementStatus,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SessionPlacements,
  type PlacementStateFrame,
} from '../../src/computers/computer-placements';
import { DrivePlacements } from '../../src/drive/placements';
import { testLogger } from '../support/logs';
import type { DriveActor } from '../../src/drive/service-read';
import { ComputerNodesRepository } from '../../src/store/repositories/computer-nodes';
import { DevicesRepository } from '../../src/store/repositories/devices';
import { DrivePlacementsRepository } from '../../src/store/repositories/drive-placements';
import { ProfilesRepository } from '../../src/store/repositories/profiles';
import { UNSYNCED } from '../../src/store/repositories/drive-roots';
import { folderRoot, NOW, openDriveFixture, type DriveFixture } from './drive-fixture';

const HOME_ROOT = '0d000000-0000-4000-8000-000000000001';
const SYNCED_ROOT = '0d000000-0000-4000-8000-000000000002';
const OTHER_ROOT = '0d000000-0000-4000-8000-000000000003';
const PERSON_ROOT = '0d000000-0000-4000-8000-000000000004';
const ROMS = '0f000000-0000-4000-8000-000000000001';
const SNES = '0f000000-0000-4000-8000-000000000002';
const MUSIC = '0f000000-0000-4000-8000-000000000003';
const NOTES = '0f000000-0000-4000-8000-000000000004';
const OTHER_FOLDER = '0f000000-0000-4000-8000-000000000005';
const PERSON_FOLDER = '0f000000-0000-4000-8000-000000000006';
const LATER = '2026-11-08T00:00:00.000Z';

let fixture: DriveFixture;
let placements: DrivePlacements;
let repository: DrivePlacementsRepository;
let nodes: ComputerNodesRepository;
let devices: DevicesRepository;
let profiles: ProfilesRepository;
let robin: DriveActor;
let ida: DriveActor;
let robinDesk: string;
let idaDesk: string;
const opened: SessionPlacements[] = [];
let idCounter = 0;
let nodeCount = 0;

function newId(): string {
  idCounter += 1;
  return `0a000000-0000-4000-8000-${idCounter.toString(16).padStart(12, '0')}`;
}

function pair(profileId: string | null): string {
  nodeCount += 1;
  const [device] = devices.upsert([
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

function file(id: string, rootId: string, name: string): void {
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
      parentId: null,
      relPath: name,
      name,
      kind: 'document',
      mime: 'text/plain',
      bytes: 3,
      sha256: null,
      integrity: 'unknown',
      thumb: { state: 'none' },
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

function status(fields: Partial<DrivePlacementStatus> = {}): DrivePlacementStatus {
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
    reason: null,
    reportedAt: LATER,
    ...fields,
  };
}

beforeEach(() => {
  fixture = openDriveFixture();
  const { context } = fixture;
  profiles = new ProfilesRepository(context);
  devices = new DevicesRepository(context);
  nodes = new ComputerNodesRepository(context);
  repository = new DrivePlacementsRepository(context);
  const ownerId = profiles.first().id;
  const robinId = profiles.create({ name: 'Robin' }).id;
  const idaId = profiles.create({ name: 'Ida' }).id;
  robin = { profileId: robinId, owner: false };
  ida = { profileId: idaId, owner: false };
  robinDesk = pair(robinId);
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
  fixture.roots.insert(folderRoot(OTHER_ROOT, '/srv/other', { label: 'Archive', readOnly: true }));
  fixture.roots.insert(
    folderRoot(PERSON_ROOT, '/srv/person', {
      label: 'Ida',
      scope: 'person',
      ownerProfileId: idaId,
      readOnly: false,
    }),
  );
  folder(ROMS, HOME_ROOT, 'Roms', null);
  folder(SNES, HOME_ROOT, 'Roms/Snes', ROMS);
  folder(MUSIC, HOME_ROOT, 'Music', null);
  file(NOTES, HOME_ROOT, 'notes.txt');
  folder(OTHER_FOLDER, OTHER_ROOT, 'Old', null);
  folder(PERSON_FOLDER, PERSON_ROOT, 'Private', null);
  idCounter = 0;
  placements = new DrivePlacements({
    store: {
      drivePlacements: repository,
      driveRoots: fixture.roots,
      driveItems: fixture.items,
      computerNodes: nodes,
    },
    context,
    nodeActor: (deviceId): DriveActor => {
      const person = nodes.personOf(deviceId);
      if (person === null) throw new Error('no person');
      return { profileId: person, owner: person === ownerId };
    },
    newId,
  });
});

afterEach(() => {
  opened.splice(0).forEach((session) => {
    session.close();
  });
  fixture.database.close();
});

function nextTick(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function stateFrame(
  placementId: string,
  fields: Partial<DrivePlacementStatus> = {},
): PlacementStateFrame {
  return { type: 'placement_state', placementId, ...status(fields) };
}

interface Link {
  readonly session: SessionPlacements;
  readonly sent: HubFrame[];
  readonly logged: string[];
  demand: boolean;
}

function link(): Link {
  const sent: HubFrame[] = [];
  const logged: string[] = [];
  const state = { demand: false };
  const log = testLogger();
  const session = new SessionPlacements({
    placements,
    send: (frame): void => {
      sent.push(frame);
    },
    mountsDemanded: (): boolean => state.demand,
    log,
  });
  vi.spyOn(log, 'warn').mockImplementation((event) => {
    logged.push(event);
  });
  opened.push(session);
  return {
    session,
    sent,
    logged,
    get demand(): boolean {
      return state.demand;
    },
    set demand(value: boolean) {
      state.demand = value;
    },
  };
}

function frames(sent: readonly HubFrame[]): readonly (readonly string[])[] {
  return sent.flatMap((frame) =>
    frame.type === 'placements' ? [frame.placements.map((placement) => placement.id)] : [],
  );
}

describe('sending placements to a computer', () => {
  it('sends the active placements of the device when its session opens', () => {
    const mine = placements.set(robin, request(robinDesk));
    placements.set(ida, request(idaDesk, { localPath: '/home/ida/Games' }));
    const { session, sent } = link();
    session.open(robinDesk);
    expect(frames(sent)).toEqual([[mine.id]]);
  });

  it('sends a replacement only to the device that changed', async () => {
    const robinLink = link();
    const idaLink = link();
    robinLink.session.open(robinDesk);
    idaLink.session.open(idaDesk);
    const placed = placements.set(robin, request(robinDesk));
    await nextTick();
    expect(frames(robinLink.sent)).toEqual([[], [placed.id]]);
    expect(frames(idaLink.sent)).toEqual([[]]);
  });

  it('does not send held or disabled placements', async () => {
    const held = placements.set(robin, request(robinDesk));
    const off = placements.set(robin, request(robinDesk, { rootId: OTHER_ROOT, enabled: false }));
    await nextTick();
    const { session, sent } = link();
    session.open(robinDesk);
    placements.setHold(held.id, 'trashed');
    await nextTick();
    expect(off.enabled).toBe(false);
    expect(frames(sent)).toEqual([[held.id], []]);
  });

  it('stops sending after the session closes', async () => {
    const { session, sent } = link();
    session.open(robinDesk);
    session.close();
    placements.set(robin, request(robinDesk));
    await nextTick();
    expect(frames(sent)).toEqual([[]]);
  });

  it('sends again on a repeated open without subscribing twice', async () => {
    const { session, sent } = link();
    session.open(robinDesk);
    session.open(robinDesk);
    placements.set(robin, request(robinDesk));
    await nextTick();
    expect(sent).toHaveLength(3);
  });
});

describe('placement state from a computer', () => {
  it('stores the reported status of its own placement', () => {
    const placed = placements.set(robin, request(robinDesk));
    const { session } = link();
    session.open(robinDesk);
    session.received(stateFrame(placed.id, { state: 'mounted', route: 'remote' }));
    expect(repository.byId(placed.id).status).toMatchObject({
      state: 'mounted',
      route: 'remote',
      cacheBytes: 10,
    });
  });

  it('refuses and logs a placement of another computer', () => {
    const foreign = placements.set(ida, request(idaDesk, { localPath: '/home/ida/Games' }));
    const { session, logged } = link();
    session.open(robinDesk);
    session.received(stateFrame(foreign.id));
    expect(repository.byId(foreign.id).status.state).toBe('starting');
    expect(logged).toEqual(['computer.placement_state_refused']);
  });

  it('refuses and logs a placement that does not exist', () => {
    const { session, logged } = link();
    session.open(robinDesk);
    session.received(stateFrame('0a0000ff-0000-4000-8000-000000000000'));
    expect(logged).toEqual(['computer.placement_state_refused']);
  });

  it('refuses a report before the session has opened', () => {
    const placed = placements.set(robin, request(robinDesk));
    const { session, logged } = link();
    session.received(stateFrame(placed.id));
    expect(repository.byId(placed.id).status.state).toBe('starting');
    expect(logged).toEqual(['computer.placement_state_before_hello']);
  });

  it('stores a state transition whether or not counters are demanded', () => {
    const placed = placements.set(robin, request(robinDesk));
    const rig = link();
    rig.session.open(robinDesk);
    rig.session.received(stateFrame(placed.id, { state: 'mounted', cacheBytes: 5 }));
    expect(repository.byId(placed.id).status).toMatchObject({ state: 'mounted', cacheBytes: 5 });
  });

  it('stores counter-only changes only while the mounts view is demanded', () => {
    const placed = placements.set(robin, request(robinDesk));
    const rig = link();
    rig.session.open(robinDesk);
    rig.session.received(
      stateFrame(placed.id, { state: 'starting', tier: null, route: null, cacheBytes: 0 }),
    );
    rig.session.received(
      stateFrame(placed.id, { state: 'starting', tier: null, route: null, cacheBytes: 99 }),
    );
    expect(repository.byId(placed.id).status.cacheBytes).toBe(0);
    rig.demand = true;
    rig.session.received(
      stateFrame(placed.id, { state: 'starting', tier: null, route: null, cacheBytes: 99 }),
    );
    expect(repository.byId(placed.id).status.cacheBytes).toBe(99);
  });

  it('stores the status of a held placement it reported before the hold', () => {
    const placed = placements.set(robin, request(robinDesk));
    const { session } = link();
    session.open(robinDesk);
    placements.setHold(placed.id, 'trashed');
    session.received(stateFrame(placed.id, { state: 'stopped', reason: 'Folder is in the trash' }));
    expect(repository.byId(placed.id).status.state).toBe('stopped');
  });
});
