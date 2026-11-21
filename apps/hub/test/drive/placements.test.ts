import { ApiError, type DrivePlacement, type LiveChange } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  HOME_DRIVE,
  IDA_DRIVE,
  IDA_PRIVATE,
  MUSIC,
  NOTES,
  OWNER_DRIVE,
  ROBIN_DRIVE,
  ROBIN_PRIVATE,
  ROBIN_TRIP,
  ROBIN_TRIP_DEEP,
  ROMS,
  ROMS_INNER,
  newId,
  openPlacementWorld,
  place,
  placementRequest,
  status,
  type PlacementWorld,
} from './placement-fixture';
import { placementChangeIn, type PlacementChange } from '../../src/drive/units/placements';

let world: PlacementWorld;

async function refusal(work: () => unknown): Promise<ApiError> {
  try {
    await work();
  } catch (cause) {
    if (cause instanceof ApiError) return cause;
    throw cause;
  }
  throw new Error('the work was not refused');
}

function changes(): LiveChange[] {
  const seen: LiveChange[] = [];
  world.store.feed.subscribe((change) => {
    if (change.table === 'drive_placements') seen.push(change);
  });
  return seen;
}

function nextTick(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function grant(itemId: string, profileId: string, role: 'view' | 'edit'): void {
  world.store.driveGrants.set({ itemId, profileId, role, expiresAt: null }, world.robin.profileId);
}

beforeEach(async () => {
  world = await openPlacementWorld();
});

afterEach(async () => {
  await world.close();
});

describe('setting a placement', () => {
  it('mounts the whole My Drive of the computer’s person, starting and unreported', async () => {
    const seen = changes();
    const mounted = await world.placements.setMount(world.robin, {
      deviceId: world.robinDesk,
      enabled: true,
    });
    expect(mounted).toMatchObject({
      deviceId: world.robinDesk,
      rootId: ROBIN_DRIVE,
      folderItemId: null,
      mode: 'mounted',
      localPath: null,
      mountName: 'My Drive',
      enabled: true,
      hold: null,
      createdBy: world.robin.profileId,
      status: { state: 'starting', tier: null, route: null, readOnly: false, mountPoint: null },
    });
    expect(mounted.excluded).toBeUndefined();
    expect(seen.map((change) => change.operation)).toEqual(['INSERT']);
  });

  it('turns the one mount of a computer off and on without a second row', async () => {
    const on = await world.placements.setMount(world.robin, {
      deviceId: world.robinDesk,
      enabled: true,
    });
    const off = await world.placements.setMount(world.robin, {
      deviceId: world.robinDesk,
      enabled: false,
    });
    expect(off).toMatchObject({ id: on.id, enabled: false, rootId: ROBIN_DRIVE });
    const again = await world.placements.setMount(world.robin, {
      deviceId: world.robinDesk,
      enabled: true,
    });
    expect(again).toMatchObject({ id: on.id, enabled: true });
    expect(world.store.drivePlacements.forDevice(world.robinDesk)).toHaveLength(1);
  });

  it('starts a mount that was never turned on as off', async () => {
    const off = await world.placements.setMount(world.ida, {
      deviceId: world.idaDesk,
      enabled: false,
    });
    expect(off).toMatchObject({ rootId: IDA_DRIVE, enabled: false });
    expect(await world.placements.activeFor(world.idaDesk)).toEqual([]);
  });

  it('keeps a whole-drive sync beside the whole-drive mount', async () => {
    const mounted = await world.placements.setMount(world.robin, {
      deviceId: world.robinDesk,
      enabled: true,
    });
    const synced = place(world, world.robin, world.robinDesk, { rootId: ROBIN_DRIVE });
    expect(synced.id).not.toBe(mounted.id);
    expect(
      (await world.placements.activeFor(world.robinDesk)).map((row) => row.mode).sort(),
    ).toEqual(['mounted', 'synced']);
  });

  it('refuses a mount on another person’s computer and a computer with a stray mount', async () => {
    expect(
      await refusal(async () =>
        world.placements.setMount(world.owner, { deviceId: world.idaDesk, enabled: true }),
      ),
    ).toMatchObject({ code: 'not_found' });
    place(world, world.robin, world.robinDesk, { mode: 'mounted', folderItemId: ROMS });
    expect(
      await refusal(async () =>
        world.placements.setMount(world.robin, {
          deviceId: world.robinDesk,
          enabled: true,
        }),
      ),
    ).toMatchObject({ code: 'conflict' });
  });

  it('places your own whole drive and a folder inside it as synced', () => {
    const whole = place(world, world.robin, world.robinDesk, {
      rootId: ROBIN_DRIVE,
      mode: 'synced',
    });
    expect(whole).toMatchObject({
      mode: 'synced',
      rootId: ROBIN_DRIVE,
      folderItemId: null,
      excluded: [],
      ignorePatterns: [],
      conflictCopies: false,
    });
    const folder = place(world, world.robin, world.secondRobinDesk, {
      rootId: ROBIN_DRIVE,
      folderItemId: ROBIN_TRIP,
      mode: 'synced',
      excluded: ['Photos'],
      ignorePatterns: ['*.tmp'],
      conflictCopies: true,
    });
    expect(folder).toMatchObject({
      mode: 'synced',
      folderItemId: ROBIN_TRIP,
      excluded: ['Photos'],
      ignorePatterns: ['*.tmp'],
      conflictCopies: true,
    });
  });

  it('refuses a malformed excluded folder', async () => {
    for (const excluded of ['/Photos', 'a//b', '../out', './here']) {
      expect(
        await refusal(() =>
          place(world, world.robin, world.robinDesk, {
            rootId: ROBIN_DRIVE,
            folderItemId: ROBIN_TRIP,
            mode: 'synced',
            excluded: [excluded],
          }),
        ),
      ).toMatchObject({ code: 'invalid_request' });
    }
  });

  it('refuses a computer that is not paired, revoked or bound to nobody', async () => {
    expect(
      await refusal(async () =>
        world.placements.set(world.owner, placementRequest('0e000000-0000-4000-8000-000000000999')),
      ),
    ).toMatchObject({ code: 'not_found' });
    world.store.computerNodes.revoke(world.robinDesk);
    expect(
      await refusal(async () =>
        world.placements.set(world.robin, placementRequest(world.robinDesk)),
      ),
    ).toMatchObject({ code: 'not_found' });
  });

  it('refuses placing on another person computer, the Hub owner included', async () => {
    expect(
      await refusal(async () => world.placements.set(world.robin, placementRequest(world.idaDesk))),
    ).toMatchObject({ code: 'not_found' });
    expect(
      await refusal(async () => world.placements.set(world.owner, placementRequest(world.idaDesk))),
    ).toMatchObject({ code: 'not_found' });
    expect(world.store.drivePlacements.list()).toEqual([]);
  });

  it('refuses another person drive and folder, the Hub owner included', async () => {
    expect(
      await refusal(() =>
        place(world, world.owner, world.ownerDesk, { rootId: IDA_DRIVE, mode: 'synced' }),
      ),
    ).toMatchObject({ code: 'not_found' });
    expect(
      await refusal(() =>
        place(world, world.owner, world.ownerDesk, {
          rootId: IDA_DRIVE,
          folderItemId: IDA_PRIVATE,
        }),
      ),
    ).toMatchObject({ code: 'not_found' });
    expect(
      await refusal(() =>
        place(world, world.owner, world.ownerDesk, {
          rootId: ROBIN_DRIVE,
          folderItemId: ROBIN_PRIVATE,
        }),
      ),
    ).toMatchObject({ code: 'not_found' });
    expect(world.store.drivePlacements.list()).toEqual([]);
  });

  it('refuses a missing drive, a folder of another drive and a file', async () => {
    expect(
      await refusal(() =>
        place(world, world.robin, world.robinDesk, {
          rootId: '0d000000-0000-4000-8000-000000000999',
        }),
      ),
    ).toMatchObject({ code: 'not_found' });
    expect(
      await refusal(() => place(world, world.robin, world.robinDesk, { folderItemId: ROBIN_TRIP })),
    ).toMatchObject({ code: 'not_found' });
    expect(
      await refusal(() => place(world, world.robin, world.robinDesk, { folderItemId: NOTES })),
    ).toMatchObject({ code: 'invalid_request' });
  });

  it('changes path, enabled and settings of the same folder without a second row', () => {
    const first = place(world, world.owner, world.ownerDesk, { rootId: OWNER_DRIVE });
    const second = place(world, world.owner, world.ownerDesk, {
      rootId: OWNER_DRIVE,
      localPath: '/home/owner/Docs',
      enabled: false,
      excluded: ['Old'],
    });
    expect(second).toMatchObject({
      id: first.id,
      mode: 'synced',
      localPath: '/home/owner/Docs',
      enabled: false,
      excluded: ['Old'],
      createdBy: first.createdBy,
    });
    expect(world.store.drivePlacements.list()).toHaveLength(1);
    const back = place(world, world.owner, world.ownerDesk, { rootId: OWNER_DRIVE });
    expect(back.id).toBe(first.id);
    expect(back.excluded).toEqual([]);
  });
});

describe('what a grant allows', () => {
  it('places a folder shared by view as read only', () => {
    grant(ROBIN_TRIP, world.ida.profileId, 'view');
    const placed = place(world, world.ida, world.idaDesk, {
      rootId: ROBIN_DRIVE,
      folderItemId: ROBIN_TRIP,
    });
    expect(placed.status.readOnly).toBe(true);
  });

  it('places a folder shared by edit as writable, and a folder inside a shared folder', () => {
    grant(ROBIN_TRIP, world.ida.profileId, 'edit');
    const folder = place(world, world.ida, world.idaDesk, {
      rootId: ROBIN_DRIVE,
      folderItemId: ROBIN_TRIP,
      mode: 'mounted',
    });
    expect(folder.status.readOnly).toBe(false);
    const inner = place(world, world.ida, world.idaDesk, {
      rootId: ROBIN_DRIVE,
      folderItemId: ROBIN_TRIP_DEEP,
      mode: 'synced',
      localPath: '/home/ida/Photos',
    });
    expect(inner.status.readOnly).toBe(false);
  });

  it('refuses the whole drive of the person who shared one folder, and any unshared folder', async () => {
    grant(ROBIN_TRIP, world.ida.profileId, 'edit');
    expect(
      await refusal(() => place(world, world.ida, world.idaDesk, { rootId: ROBIN_DRIVE })),
    ).toMatchObject({ code: 'not_found' });
    expect(
      await refusal(() =>
        place(world, world.ida, world.idaDesk, {
          rootId: ROBIN_DRIVE,
          folderItemId: ROBIN_PRIVATE,
        }),
      ),
    ).toMatchObject({ code: 'not_found' });
  });
});

describe('nesting of synced folders on one computer', () => {
  const synced = (fields: Parameters<typeof place>[3]): DrivePlacement =>
    place(world, world.robin, world.robinDesk, { rootId: ROBIN_DRIVE, mode: 'synced', ...fields });

  it('refuses a synced folder inside a synced folder and the folder that holds one', async () => {
    synced({ folderItemId: ROBIN_TRIP, localPath: '/a' });
    const inner = await refusal(() => synced({ folderItemId: ROBIN_TRIP_DEEP, localPath: '/b' }));
    expect(inner.code).toBe('conflict');
    expect(inner.message).toContain('/a');
    world.store.drivePlacements.remove(world.store.drivePlacements.list()[0]?.id ?? '');
    synced({ folderItemId: ROBIN_TRIP_DEEP, localPath: '/b' });
    const outer = await refusal(() => synced({ folderItemId: ROBIN_TRIP, localPath: '/a' }));
    expect(outer.code).toBe('conflict');
    expect(outer.message).toContain('/b');
  });

  it('refuses a whole synced drive next to a synced folder of it, and the reverse', async () => {
    synced({ folderItemId: ROBIN_TRIP, localPath: '/a' });
    expect(await refusal(() => synced({ folderItemId: null, localPath: '/b' }))).toMatchObject({
      code: 'conflict',
    });
    world.store.drivePlacements.remove(world.store.drivePlacements.list()[0]?.id ?? '');
    synced({ folderItemId: null, localPath: '/b' });
    expect(
      await refusal(() => synced({ folderItemId: ROBIN_TRIP, localPath: '/a' })),
    ).toMatchObject({
      code: 'conflict',
    });
  });

  it('lets two sibling folders of one drive sync on one computer', () => {
    const first = synced({ folderItemId: ROBIN_TRIP, localPath: '/a' });
    const second = synced({ folderItemId: ROBIN_PRIVATE, localPath: '/b' });
    expect(first.id).not.toBe(second.id);
    expect(world.store.drivePlacements.forDevice(world.robinDesk)).toHaveLength(2);
  });

  it('lets a mounted placement overlap synced ones, and other computers and drives sync freely', () => {
    synced({ folderItemId: ROBIN_TRIP, localPath: '/a' });
    expect(
      place(world, world.robin, world.robinDesk, {
        rootId: ROBIN_DRIVE,
        folderItemId: ROBIN_TRIP_DEEP,
        mountName: 'm',
      }).mode,
    ).toBe('mounted');
    expect(
      place(world, world.robin, world.secondRobinDesk, {
        rootId: ROBIN_DRIVE,
        folderItemId: ROBIN_TRIP,
        mode: 'synced',
        localPath: '/a',
      }).id,
    ).toBeDefined();
    expect(
      place(world, world.robin, world.robinDesk, {
        rootId: HOME_DRIVE,
        mode: 'synced',
        localPath: '/h',
      }).id,
    ).toBeDefined();
  });

  it('keeps the nesting refusal out of mounted placements', () => {
    place(world, world.robin, world.robinDesk, { folderItemId: ROMS });
    expect(
      place(world, world.robin, world.robinDesk, { folderItemId: ROMS_INNER, mountName: 'b' }).id,
    ).toBeDefined();
    expect(
      place(world, world.robin, world.robinDesk, { folderItemId: MUSIC, mountName: 'c' }).id,
    ).toBeDefined();
  });
});

describe('the stored uniqueness', () => {
  const insert = (rootId: string, folderItemId: string | null): void => {
    world.test.store.context.sql.run(
      'insert a placement row',
      `insert into drive_placements (id, device_id, root_id, folder_item_id, mode, mount_name,
        enabled, hold, created_by, created_at, state, tier, basic_limits, read_only, route,
        cache_bytes, pinned_bytes, open_files, pending_uploads, need_bytes, last_synced_at, errors,
        reason, reported_at)
        values ($id, $deviceId, $rootId, $folderItemId, 'mounted', 'x', 1, null, $createdBy,
        $now, 'starting', null, null, 0, null, 0, 0, 0, 0, 0, null, '[]', null, $now)`,
      {
        id: newId(),
        deviceId: world.robinDesk,
        rootId,
        folderItemId,
        createdBy: world.robin.profileId,
        now: '2026-11-07T00:00:00.000Z',
      },
    );
  };

  it('allows one whole-drive row per computer and drive', () => {
    insert(HOME_DRIVE, null);
    expect(() => {
      insert(HOME_DRIVE, null);
    }).toThrow(/unique/i);
    expect(() => {
      insert(ROBIN_DRIVE, null);
    }).not.toThrow();
  });

  it('allows one row per computer and folder', () => {
    insert(HOME_DRIVE, ROMS);
    expect(() => {
      insert(HOME_DRIVE, ROMS);
    }).toThrow(/unique/i);
    expect(() => {
      insert(HOME_DRIVE, MUSIC);
    }).not.toThrow();
  });
});

describe('listing', () => {
  it('shows each person only the placements on their own computers, the Hub owner included', async () => {
    place(world, world.owner, world.ownerDesk);
    place(world, world.robin, world.robinDesk);
    place(world, world.ida, world.idaDesk);
    expect((await world.placements.list(world.owner)).map((row) => row.deviceId)).toEqual([
      world.ownerDesk,
    ]);
    expect((await world.placements.list(world.robin)).map((row) => row.deviceId)).toEqual([
      world.robinDesk,
    ]);
    expect((await world.placements.list(world.ida)).map((row) => row.deviceId)).toEqual([
      world.idaDesk,
    ]);
  });

  it('removes only for the person of the computer, the Hub owner included', async () => {
    const placed = place(world, world.robin, world.robinDesk);
    for (const other of [world.ida, world.owner]) {
      expect(
        await refusal(async () => {
          await world.placements.removeFor(other, placed.id);
        }),
      ).toMatchObject({ code: 'not_found' });
    }
    expect(world.store.drivePlacements.list()).toHaveLength(1);
    const seen = changes();
    await world.placements.removeFor(world.robin, placed.id);
    expect(world.store.drivePlacements.list()).toEqual([]);
    expect(seen.map((change) => change.operation)).toEqual(['DELETE']);
    expect(
      await refusal(async () => {
        await world.placements.removeFor(world.robin, placed.id);
      }),
    ).toMatchObject({ code: 'not_found' });
  });
});

describe('active placements', () => {
  it('sends only enabled placements without a hold', async () => {
    const kept = place(world, world.robin, world.robinDesk);
    const off = place(world, world.robin, world.robinDesk, { rootId: ROBIN_DRIVE, enabled: false });
    const held = place(world, world.robin, world.robinDesk, {
      rootId: HOME_DRIVE,
      folderItemId: MUSIC,
      mountName: 'm',
    });
    await world.placements.setHold(held.id, 'trashed');
    expect((await world.placements.activeFor(world.robinDesk)).map((row) => row.id)).toEqual([
      kept.id,
    ]);
    await world.placements.setHold(held.id, null);
    expect((await world.placements.activeFor(world.robinDesk)).map((row) => row.id)).toEqual([
      kept.id,
      held.id,
    ]);
    expect(off.enabled).toBe(false);
  });

  it('keeps a held placement visible with its hold', async () => {
    const placed = place(world, world.robin, world.robinDesk);
    await world.placements.setHold(placed.id, 'no_access');
    expect((await world.placements.list(world.robin))[0]).toMatchObject({ hold: 'no_access' });
  });
});

describe('status reports', () => {
  it('writes the status of a placement of that computer and publishes it', async () => {
    const placed = place(world, world.robin, world.robinDesk);
    const seen = changes();
    const reported = status({
      needBytes: 4096,
      lastSyncedAt: '2026-11-08T00:00:00.000Z',
      errors: [{ relPath: 'a.txt', message: 'locked', at: '2026-11-08T00:00:00.000Z' }],
    });
    const written = await world.placements.writeStatus(world.robinDesk, placed.id, reported);
    expect(written.status).toEqual(reported);
    expect(seen.map((change) => change.operation)).toEqual(['UPDATE']);
  });

  it('refuses a status from another computer and a missing placement', async () => {
    const placed = place(world, world.robin, world.robinDesk);
    expect(
      await refusal(async () => world.placements.writeStatus(world.idaDesk, placed.id, status())),
    ).toMatchObject({ code: 'forbidden' });
    expect(
      await refusal(async () =>
        world.placements.writeStatus(
          world.robinDesk,
          '0a000000-0000-4000-8000-0000000fffff',
          status(),
        ),
      ),
    ).toMatchObject({ code: 'not_found' });
  });

  it('stores basic limits', async () => {
    const placed = place(world, world.robin, world.robinDesk);
    const limits = { maxFileBytes: 50_000_000, wholeFileOpen: true, offline: false } as const;
    const written = await world.placements.writeStatus(
      world.robinDesk,
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
    world.placements.onDeviceChanged((deviceIds) => heard.push(deviceIds));
  });

  it('fires once for a device whose active set changed', async () => {
    place(world, world.robin, world.robinDesk);
    await nextTick();
    expect(heard).toEqual([[world.robinDesk]]);
  });

  it('names each changed device of several changes in one write', () => {
    const request = (deviceId: string): PlacementChange => ({
      op: 'set',
      actor: world.robin,
      input: placementRequest(deviceId),
      id: newId(),
    });
    const result = world.store.write(() =>
      placementChangeIn(world.store, [
        request(world.robinDesk),
        request(world.secondRobinDesk),
        request(world.robinDesk),
      ]),
    );
    expect([...result.devices].sort()).toEqual([world.robinDesk, world.secondRobinDesk].sort());
  });

  it('stays quiet for status writes and for a change that leaves the active set alone', async () => {
    const placed = place(world, world.robin, world.robinDesk, { enabled: false });
    await nextTick();
    heard.length = 0;
    await world.placements.writeStatus(world.robinDesk, placed.id, status());
    place(world, world.robin, world.robinDesk, { enabled: false });
    await world.placements.setHold(placed.id, 'trashed');
    await nextTick();
    expect(heard).toEqual([]);
  });

  it('fires for a hold, a release, a path change, a sync setting change and a removal', async () => {
    const placed = place(world, world.robin, world.robinDesk, {
      rootId: ROBIN_DRIVE,
      mode: 'synced',
    });
    await nextTick();
    heard.length = 0;
    await world.placements.setHold(placed.id, 'no_access');
    await nextTick();
    await world.placements.setHold(placed.id, null);
    await nextTick();
    place(world, world.robin, world.robinDesk, {
      rootId: ROBIN_DRIVE,
      mode: 'synced',
      localPath: '/elsewhere',
    });
    await nextTick();
    place(world, world.robin, world.robinDesk, {
      rootId: ROBIN_DRIVE,
      mode: 'synced',
      localPath: '/elsewhere',
      excluded: ['Old'],
    });
    await nextTick();
    await world.placements.remove(placed.id);
    await nextTick();
    expect(heard).toEqual(Array.from({ length: 5 }, () => [world.robinDesk]));
  });

  it('fires when access changes the read only state', async () => {
    grant(ROBIN_TRIP, world.ida.profileId, 'edit');
    const placed = place(world, world.ida, world.idaDesk, {
      rootId: ROBIN_DRIVE,
      folderItemId: ROBIN_TRIP,
    });
    await nextTick();
    heard.length = 0;
    await world.placements.setReadOnly(placed.id, true);
    await nextTick();
    expect(world.store.drivePlacements.byId(placed.id).status.readOnly).toBe(true);
    expect(heard).toEqual([[world.idaDesk]]);
  });

  it('does not name a device that was not changed', async () => {
    place(world, world.robin, world.robinDesk);
    await nextTick();
    heard.length = 0;
    place(world, world.ida, world.idaDesk);
    await nextTick();
    expect(heard).toEqual([[world.idaDesk]]);
  });

  it('stays quiet when the write fails and still works afterwards', async () => {
    await expect(
      world.placements.set(world.robin, placementRequest(world.idaDesk)),
    ).rejects.toMatchObject({ code: 'not_found' });
    await nextTick();
    expect(heard).toEqual([]);
    expect(world.store.drivePlacements.list()).toEqual([]);
    place(world, world.robin, world.robinDesk);
    await nextTick();
    expect(heard).toEqual([[world.robinDesk]]);
  });

  it('stops after unsubscribing', async () => {
    const stop = world.placements.onDeviceChanged(() => {
      throw new Error('should not be called');
    });
    stop();
    place(world, world.robin, world.robinDesk);
    await nextTick();
    expect(heard).toEqual([[world.robinDesk]]);
  });
});

describe('reading a stored placement', () => {
  it('returns exactly what was created', () => {
    const placed = place(world, world.robin, world.robinDesk, {
      rootId: ROBIN_DRIVE,
      mode: 'synced',
    });
    expect(world.store.drivePlacements.byId(placed.id)).toEqual(placed);
  });
});
