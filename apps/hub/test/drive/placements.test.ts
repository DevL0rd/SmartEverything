import { randomBytes } from 'node:crypto';
import {
  ApiError,
  DRIVE_PLACEMENT_SET,
  type DrivePlacement,
  type DrivePlacementSet,
  type DrivePlacementStatus,
  type LiveChange,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DrivePlacements } from '../../src/drive/placements';
import type { DriveActor } from '../../src/drive/service-read';
import { driveRowVisible } from '../../src/server/live-access';
import { ComputerNodesRepository } from '../../src/store/repositories/computer-nodes';
import { DevicesRepository } from '../../src/store/repositories/devices';
import { DrivePlacementsRepository } from '../../src/store/repositories/drive-placements';
import { ProfilesRepository } from '../../src/store/repositories/profiles';
import { UNSYNCED } from '../../src/store/repositories/drive-roots';
import { folderRoot, NOW, openDriveFixture, type DriveFixture } from './drive-fixture';

type Hearer = Parameters<typeof driveRowVisible>[0];

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
let owner: DriveActor;
let robin: DriveActor;
let ida: DriveActor;
let ownerDesk: string;
let robinDesk: string;
let idaDesk: string;
let secondRobinDesk: string;
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

function refusal(work: () => unknown): ApiError {
  try {
    work();
  } catch (cause) {
    if (cause instanceof ApiError) return cause;
    throw cause;
  }
  throw new Error('the work was not refused');
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

function changes(): LiveChange[] {
  const seen: LiveChange[] = [];
  fixture.feed.subscribe((change) => {
    if (change.table === 'drive_placements') seen.push(change);
  });
  return seen;
}

function nextTick(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
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
  owner = { profileId: ownerId, owner: true };
  robin = { profileId: robinId, owner: false };
  ida = { profileId: idaId, owner: false };
  ownerDesk = pair(ownerId);
  robinDesk = pair(robinId);
  idaDesk = pair(idaId);
  secondRobinDesk = pair(robinId);
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
  fixture.database.close();
});

describe('setting a placement', () => {
  it('places a whole library folder as mounted only, starting and unreported', () => {
    const seen = changes();
    const placed = placements.set(robin, request(robinDesk));
    expect(placed).toMatchObject({
      deviceId: robinDesk,
      rootId: HOME_ROOT,
      folderItemId: null,
      mode: 'mounted',
      localPath: '/home/robin/Games',
      enabled: true,
      hold: null,
      createdBy: robin.profileId,
      status: { state: 'starting', tier: null, route: null, readOnly: false, reason: null },
    });
    expect(seen.map((change) => change.operation)).toEqual(['INSERT']);
  });

  it('places a folder inside a library folder as mounted only', () => {
    const placed = placements.set(robin, request(robinDesk, { folderItemId: SNES }));
    expect(placed).toMatchObject({ rootId: HOME_ROOT, folderItemId: SNES, mode: 'mounted' });
  });

  it('gives readOnly true for a read-only linked root', () => {
    const placed = placements.set(
      owner,
      request(ownerDesk, { rootId: OTHER_ROOT, folderItemId: OTHER_FOLDER }),
    );
    expect(placed.status.readOnly).toBe(true);
  });

  it('places a synced library folder when its sync is on', () => {
    const placed = placements.set(
      robin,
      request(robinDesk, { rootId: SYNCED_ROOT, mode: 'synced' }),
    );
    expect(placed).toMatchObject({ mode: 'synced', rootId: SYNCED_ROOT, folderItemId: null });
  });

  it('refuses synced on a root with sync off', () => {
    expect(
      refusal(() => placements.set(robin, request(robinDesk, { mode: 'synced' }))),
    ).toMatchObject({
      code: 'invalid_request',
    });
  });

  it('refuses synced together with a folder before it reaches the hub', () => {
    expect(() =>
      request(robinDesk, { rootId: SYNCED_ROOT, mode: 'synced', folderItemId: SNES }),
    ).toThrow();
  });

  it('refuses a computer that is not paired', () => {
    expect(
      refusal(() => placements.set(owner, request('0e000000-0000-4000-8000-000000000999'))),
    ).toMatchObject({ code: 'not_found' });
  });

  it('refuses a computer whose pairing was revoked', () => {
    nodes.revoke(robinDesk);
    expect(refusal(() => placements.set(owner, request(robinDesk)))).toMatchObject({
      code: 'not_found',
    });
  });

  it('refuses a computer that is bound to no person', () => {
    const unbound = pair(null);
    expect(refusal(() => placements.set(owner, request(unbound)))).toMatchObject({
      code: 'not_found',
    });
  });

  it('refuses a member on another person computer and lets the owner act for anyone', () => {
    expect(refusal(() => placements.set(robin, request(idaDesk)))).toMatchObject({
      code: 'not_found',
    });
    expect(placements.set(owner, request(idaDesk)).deviceId).toBe(idaDesk);
  });

  it('refuses a folder the computer person cannot see', () => {
    expect(
      refusal(() => placements.set(owner, request(robinDesk, { rootId: PERSON_ROOT }))),
    ).toMatchObject({ code: 'not_found' });
    expect(
      refusal(() =>
        placements.set(
          owner,
          request(robinDesk, { rootId: PERSON_ROOT, folderItemId: PERSON_FOLDER }),
        ),
      ),
    ).toMatchObject({ code: 'not_found' });
    expect(placements.set(ida, request(idaDesk, { rootId: PERSON_ROOT })).rootId).toBe(PERSON_ROOT);
  });

  it('refuses a missing root, a folder of another root and a file', () => {
    expect(
      refusal(() =>
        placements.set(
          owner,
          request(ownerDesk, { rootId: '0d000000-0000-4000-8000-000000000999' }),
        ),
      ),
    ).toMatchObject({ code: 'not_found' });
    expect(
      refusal(() => placements.set(owner, request(ownerDesk, { folderItemId: OTHER_FOLDER }))),
    ).toMatchObject({ code: 'not_found' });
    expect(
      refusal(() => placements.set(owner, request(ownerDesk, { folderItemId: NOTES }))),
    ).toMatchObject({ code: 'invalid_request' });
  });

  it('changes mode, path and enabled of the same folder without a second row', () => {
    const first = placements.set(owner, request(ownerDesk, { rootId: SYNCED_ROOT }));
    const second = placements.set(
      owner,
      request(ownerDesk, {
        rootId: SYNCED_ROOT,
        mode: 'synced',
        localPath: '/home/owner/Docs',
        enabled: false,
      }),
    );
    expect(second).toMatchObject({
      id: first.id,
      mode: 'synced',
      localPath: '/home/owner/Docs',
      enabled: false,
      createdBy: first.createdBy,
    });
    expect(repository.list()).toHaveLength(1);
  });
});

describe('containment on one computer', () => {
  it('refuses a folder inside a placed whole library folder', () => {
    placements.set(robin, request(robinDesk));
    expect(
      refusal(() =>
        placements.set(robin, request(robinDesk, { folderItemId: ROMS, localPath: '/b' })),
      ),
    ).toMatchObject({ code: 'conflict' });
  });

  it('refuses a whole library folder that contains a placed folder', () => {
    placements.set(robin, request(robinDesk, { folderItemId: ROMS }));
    expect(
      refusal(() => placements.set(robin, request(robinDesk, { localPath: '/b' }))),
    ).toMatchObject({ code: 'conflict' });
  });

  it('refuses a folder inside a placed folder and the folder that holds a placed one', () => {
    placements.set(robin, request(robinDesk, { folderItemId: ROMS }));
    expect(
      refusal(() =>
        placements.set(robin, request(robinDesk, { folderItemId: SNES, localPath: '/b' })),
      ),
    ).toMatchObject({ code: 'conflict' });
    placements.set(robin, request(secondRobinDesk, { folderItemId: SNES }));
    expect(
      refusal(() =>
        placements.set(robin, request(secondRobinDesk, { folderItemId: ROMS, localPath: '/b' })),
      ),
    ).toMatchObject({ code: 'conflict' });
  });

  it('allows sibling folders, other roots and other computers', () => {
    placements.set(robin, request(robinDesk, { folderItemId: ROMS }));
    expect(
      placements.set(robin, request(robinDesk, { folderItemId: MUSIC, localPath: '/b' })).id,
    ).toBeDefined();
    expect(
      placements.set(robin, request(robinDesk, { rootId: SYNCED_ROOT, localPath: '/c' })).id,
    ).toBeDefined();
    expect(
      placements.set(robin, request(secondRobinDesk, { folderItemId: ROMS })).id,
    ).toBeDefined();
  });
});

describe('the stored uniqueness', () => {
  const insert = (rootId: string, folderItemId: string | null): void => {
    fixture.database
      .prepare(
        `insert into drive_placements (id, device_id, root_id, folder_item_id, mode, local_path,
          enabled, hold, created_by, created_at, state, tier, basic_limits, read_only, route,
          cache_bytes, pinned_bytes, open_files, pending_uploads, reason, reported_at)
          values (?, ?, ?, ?, 'mounted', '/x', 1, null, ?, ?, 'starting', null, null, 0, null,
          0, 0, 0, 0, null, ?)`,
      )
      .run(newId(), robinDesk, rootId, folderItemId, robin.profileId, NOW, NOW);
  };

  it('allows one whole-root row per computer and root', () => {
    insert(HOME_ROOT, null);
    expect(() => {
      insert(HOME_ROOT, null);
    }).toThrow(/unique/i);
    expect(() => {
      insert(SYNCED_ROOT, null);
    }).not.toThrow();
  });

  it('allows one row per computer and folder', () => {
    insert(HOME_ROOT, ROMS);
    expect(() => {
      insert(HOME_ROOT, ROMS);
    }).toThrow(/unique/i);
    expect(() => {
      insert(HOME_ROOT, MUSIC);
    }).not.toThrow();
  });

  it('refuses a synced row with a folder', () => {
    expect(() => {
      fixture.database
        .prepare(
          `insert into drive_placements (id, device_id, root_id, folder_item_id, mode, local_path,
            enabled, created_by, created_at, state, read_only, cache_bytes, pinned_bytes,
            open_files, pending_uploads, reported_at)
            values (?, ?, ?, ?, 'synced', '/x', 1, ?, ?, 'starting', 0, 0, 0, 0, 0, ?)`,
        )
        .run(newId(), robinDesk, HOME_ROOT, ROMS, robin.profileId, NOW, NOW);
    }).toThrow();
  });

  it('is removed with its root and leaves the other roots’ placements', () => {
    placements.set(robin, request(robinDesk, { folderItemId: ROMS }));
    placements.set(robin, request(secondRobinDesk, { rootId: SYNCED_ROOT }));
    fixture.roots.remove(SYNCED_ROOT);
    expect(repository.list().map((row) => row.folderItemId)).toEqual([ROMS]);
    fixture.roots.remove(HOME_ROOT);
    expect(repository.list()).toEqual([]);
  });
});

describe('listing and member scope', () => {
  it('shows the owner every placement and a member only their computers', () => {
    placements.set(owner, request(ownerDesk));
    placements.set(robin, request(robinDesk));
    placements.set(ida, request(idaDesk));
    expect(placements.list(owner)).toHaveLength(3);
    expect(placements.list(robin).map((row) => row.deviceId)).toEqual([robinDesk]);
    expect(placements.list(ida).map((row) => row.deviceId)).toEqual([idaDesk]);
  });

  it('removes only for someone who may manage the computer', () => {
    const placed = placements.set(robin, request(robinDesk));
    expect(
      refusal(() => {
        placements.removeFor(ida, placed.id);
      }),
    ).toMatchObject({
      code: 'not_found',
    });
    expect(repository.list()).toHaveLength(1);
    const seen = changes();
    placements.removeFor(robin, placed.id);
    expect(repository.list()).toEqual([]);
    expect(seen.map((change) => change.operation)).toEqual(['DELETE']);
    expect(
      refusal(() => {
        placements.removeFor(robin, placed.id);
      }),
    ).toMatchObject({
      code: 'not_found',
    });
  });

  it('shows a placement live to the owner and to the computer person only', () => {
    const placed = placements.set(robin, request(robinDesk));
    const personOfDevice = (deviceId: string): string | null => nodes.personOf(deviceId);
    const profileOf = (clientId: string): string => clientId;
    const hearing = (id: string, role: 'owner' | 'member'): Hearer => ({ client: { id, role } });
    const seeing = (id: string, role: 'owner' | 'member'): boolean =>
      driveRowVisible(hearing(id, role), placed, profileOf, personOfDevice);
    expect(seeing(robin.profileId, 'member')).toBe(true);
    expect(seeing(ida.profileId, 'member')).toBe(false);
    expect(seeing(ida.profileId, 'owner')).toBe(true);
  });
});

describe('active placements', () => {
  it('sends only enabled placements without a hold', () => {
    const kept = placements.set(robin, request(robinDesk));
    const off = placements.set(robin, request(robinDesk, { rootId: SYNCED_ROOT, enabled: false }));
    const held = placements.set(robin, request(robinDesk, { rootId: OTHER_ROOT }));
    placements.setHold(held.id, 'trashed');
    expect(placements.activeFor(robinDesk).map((row) => row.id)).toEqual([kept.id]);
    placements.setHold(held.id, null);
    expect(placements.activeFor(robinDesk).map((row) => row.id)).toEqual([kept.id, held.id]);
    expect(off.enabled).toBe(false);
  });

  it('keeps a held placement visible with its hold', () => {
    const placed = placements.set(robin, request(robinDesk));
    placements.setHold(placed.id, 'no_access');
    expect(placements.list(robin)[0]).toMatchObject({ hold: 'no_access' });
  });
});

describe('status reports', () => {
  it('writes the status of a placement of that computer and publishes it', () => {
    const placed = placements.set(robin, request(robinDesk));
    const seen = changes();
    const written = placements.writeStatus(robinDesk, placed.id, status());
    expect(written.status).toEqual(status());
    expect(seen.map((change) => change.operation)).toEqual(['UPDATE']);
  });

  it('refuses a status from another computer and a missing placement', () => {
    const placed = placements.set(robin, request(robinDesk));
    expect(refusal(() => placements.writeStatus(idaDesk, placed.id, status()))).toMatchObject({
      code: 'forbidden',
    });
    expect(
      refusal(() =>
        placements.writeStatus(robinDesk, '0a000000-0000-4000-8000-0000000fffff', status()),
      ),
    ).toMatchObject({ code: 'not_found' });
  });

  it('stores basic limits', () => {
    const placed = placements.set(robin, request(robinDesk));
    const limits = { maxFileBytes: 50_000_000, wholeFileOpen: true, offline: false } as const;
    const written = placements.writeStatus(
      robinDesk,
      placed.id,
      status({ tier: 'basic', basicLimits: limits }),
    );
    expect(written.status.basicLimits).toEqual(limits);
  });
});

describe('the device change listener', () => {
  let heard: (readonly string[])[];

  beforeEach(() => {
    heard = [];
    placements.onDeviceChanged((deviceIds) => heard.push(deviceIds));
  });

  it('fires once for a device whose active set changed', async () => {
    placements.set(robin, request(robinDesk));
    await nextTick();
    expect(heard).toEqual([[robinDesk]]);
  });

  it('fires once for several changes in one transaction and names each changed device', async () => {
    fixture.context.write(() => {
      placements.set(robin, request(robinDesk));
      placements.set(robin, request(robinDesk, { rootId: SYNCED_ROOT, localPath: '/b' }));
      placements.set(robin, request(secondRobinDesk));
    });
    await nextTick();
    expect(heard).toHaveLength(1);
    expect([...(heard[0] ?? [])].sort()).toEqual([robinDesk, secondRobinDesk].sort());
  });

  it('stays quiet for status writes and for a change that leaves the active set alone', async () => {
    const placed = placements.set(robin, request(robinDesk, { enabled: false }));
    await nextTick();
    heard.length = 0;
    placements.writeStatus(robinDesk, placed.id, status());
    placements.set(robin, request(robinDesk, { enabled: false }));
    placements.setHold(placed.id, 'trashed');
    await nextTick();
    expect(heard).toEqual([]);
  });

  it('fires for a hold, a release, a path change and a removal', async () => {
    const placed = placements.set(robin, request(robinDesk));
    await nextTick();
    heard.length = 0;
    placements.setHold(placed.id, 'sync_off');
    await nextTick();
    placements.setHold(placed.id, null);
    await nextTick();
    placements.set(robin, request(robinDesk, { localPath: '/elsewhere' }));
    await nextTick();
    placements.remove(placed.id);
    await nextTick();
    expect(heard).toEqual([[robinDesk], [robinDesk], [robinDesk], [robinDesk]]);
  });

  it('does not name a device that was not changed', async () => {
    placements.set(robin, request(robinDesk));
    await nextTick();
    heard.length = 0;
    placements.set(ida, request(idaDesk));
    await nextTick();
    expect(heard).toEqual([[idaDesk]]);
  });

  it('stays quiet when the transaction rolls back and still works afterwards', async () => {
    expect(() =>
      fixture.context.write(() => {
        placements.set(robin, request(robinDesk));
        throw new Error('rolled back');
      }),
    ).toThrow('rolled back');
    await nextTick();
    expect(heard).toEqual([]);
    expect(repository.list()).toEqual([]);
    placements.set(robin, request(robinDesk));
    await nextTick();
    expect(heard).toEqual([[robinDesk]]);
  });

  it('stops after unsubscribing', async () => {
    const stop = placements.onDeviceChanged(() => {
      throw new Error('should not be called');
    });
    stop();
    placements.set(robin, request(robinDesk));
    await nextTick();
    expect(heard).toEqual([[robinDesk]]);
  });
});

describe('reading a stored placement', () => {
  it('returns exactly what was created', () => {
    const placed: DrivePlacement = placements.set(robin, request(robinDesk));
    expect(repository.byId(placed.id)).toEqual(placed);
  });
});
