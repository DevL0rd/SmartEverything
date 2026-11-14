import { Logger } from '@smarteverything/logging';
import type { DrivePlacement } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import {
  SyncPlacementIntake,
  type SyncEnginePort,
  type SyncTarget,
  type SyncWaiting,
} from '../../src/drive-sync/service.js';
import { joinSynced, leaveSynced, type SwitchPorts } from '../../src/drive-sync/switch.js';

const DEVICE_ID = '33333333-3333-4333-8333-333333333333';
const DRIVE_ID = '44444444-4444-4444-8444-444444444444';
const PERSON_ID = '66666666-6666-4666-8666-666666666666';
const FIRST_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_ID = '22222222-2222-4222-8222-222222222222';
const IDLE: SyncWaiting = { needBytes: 0, pendingOps: 0 };

function placement(
  id: string,
  over: Partial<
    Pick<DrivePlacement, 'mode' | 'enabled' | 'hold' | 'localPath' | 'excluded' | 'ignorePatterns'>
  > = {},
): DrivePlacement {
  return {
    id,
    deviceId: DEVICE_ID,
    rootId: DRIVE_ID,
    folderItemId: null,
    mode: 'synced',
    excluded: [],
    ignorePatterns: [],
    conflictCopies: true,
    localPath: `/data/${id}`,
    enabled: true,
    hold: null,
    createdBy: PERSON_ID,
    createdAt: '2026-11-07T10:00:00Z',
    status: {
      state: 'starting',
      tier: null,
      basicLimits: null,
      readOnly: false,
      route: null,
      cacheBytes: 0,
      pinnedBytes: 0,
      openFiles: 0,
      pendingUploads: 0,
      needBytes: 0,
      lastSyncedAt: null,
      errors: [],
      reason: null,
      reportedAt: '2026-11-07T10:00:00Z',
    },
    ...over,
  };
}

function engine(waiting: SyncWaiting = IDLE, calls: string[] = []): SyncEnginePort {
  return {
    start: vi.fn((target: SyncTarget) => {
      calls.push(`start ${target.localPath}`);
      return Promise.resolve();
    }),
    stop: vi.fn((id: string) => {
      calls.push(`stop ${id}`);
      return Promise.resolve();
    }),
    waiting: vi.fn(() => Promise.resolve(waiting)),
  };
}

const log = new Logger('desktop.test');

describe('sync placement intake', () => {
  it('starts every enabled synced placement and ignores mounted ones', async () => {
    const port = engine();
    const intake = new SyncPlacementIntake(port, log);
    await intake.accept([placement(FIRST_ID), placement(SECOND_ID, { mode: 'mounted' })]);
    expect(port.start).toHaveBeenCalledTimes(1);
    expect(port.start).toHaveBeenCalledWith({
      placementId: FIRST_ID,
      driveId: DRIVE_ID,
      localPath: `/data/${FIRST_ID}`,
      excluded: [],
      ignorePatterns: [],
      receiveOnly: false,
    });
  });

  it.each([
    ['excluded folders', { excluded: ['skip'] }],
    ['skip patterns', { ignorePatterns: ['*.tmp'] }],
  ])('restarts a running placement when its %s change', async (_name, over) => {
    const calls: string[] = [];
    const port = engine(IDLE, calls);
    const intake = new SyncPlacementIntake(port, log);
    await intake.accept([placement(FIRST_ID)]);
    await intake.accept([placement(FIRST_ID, over)]);
    expect(calls).toEqual([
      `start /data/${FIRST_ID}`,
      `stop ${FIRST_ID}`,
      `start /data/${FIRST_ID}`,
    ]);
  });

  it('syncs a read only placement receive only', async () => {
    const port = engine();
    const intake = new SyncPlacementIntake(port, log);
    const readOnly = placement(FIRST_ID);
    await intake.accept([{ ...readOnly, status: { ...readOnly.status, readOnly: true } }]);
    expect(port.start).toHaveBeenCalledWith(expect.objectContaining({ receiveOnly: true }));
  });

  it('does not restart a placement that did not change', async () => {
    const port = engine();
    const intake = new SyncPlacementIntake(port, log);
    await intake.accept([placement(FIRST_ID)]);
    await intake.accept([placement(FIRST_ID)]);
    expect(port.start).toHaveBeenCalledTimes(1);
    expect(port.stop).not.toHaveBeenCalled();
  });

  it.each([
    ['sync_off hold', { hold: 'sync_off' as const }],
    ['trashed hold', { hold: 'trashed' as const }],
    ['disabled', { enabled: false }],
    ['switched to mounted', { mode: 'mounted' as const }],
  ])('stops a running placement on %s', async (_name, over) => {
    const port = engine();
    const intake = new SyncPlacementIntake(port, log);
    await intake.accept([placement(FIRST_ID)]);
    await intake.accept([placement(FIRST_ID, over)]);
    expect(port.stop).toHaveBeenCalledWith(FIRST_ID);
  });

  it('starts again when the hold clears', async () => {
    const port = engine();
    const intake = new SyncPlacementIntake(port, log);
    await intake.accept([placement(FIRST_ID)]);
    await intake.accept([placement(FIRST_ID, { hold: 'sync_off' })]);
    await intake.accept([placement(FIRST_ID)]);
    expect(port.start).toHaveBeenCalledTimes(2);
  });

  it('stops and restarts a placement whose path changed', async () => {
    const calls: string[] = [];
    const intake = new SyncPlacementIntake(engine(IDLE, calls), log);
    await intake.accept([placement(FIRST_ID, { localPath: '/a' })]);
    await intake.accept([placement(FIRST_ID, { localPath: '/b' })]);
    expect(calls).toEqual(['start /a', `stop ${FIRST_ID}`, 'start /b']);
  });

  it('stops everything when the placements are revoked', async () => {
    const port = engine();
    const intake = new SyncPlacementIntake(port, log);
    await intake.accept([placement(FIRST_ID), placement(SECOND_ID)]);
    await intake.stopAll();
    expect(port.stop).toHaveBeenCalledTimes(2);
  });

  it('retries a failed start on the next frame', async () => {
    const port = engine();
    vi.mocked(port.start).mockRejectedValueOnce(new Error('disk gone'));
    const intake = new SyncPlacementIntake(port, log);
    await intake.accept([placement(FIRST_ID)]);
    await intake.accept([placement(FIRST_ID)]);
    expect(port.start).toHaveBeenCalledTimes(2);
  });
});

function ports(options: {
  readonly waiting?: SyncWaiting;
  readonly existing?: readonly string[];
  readonly calls?: string[];
}): SwitchPorts {
  const calls = options.calls ?? [];
  const existing = new Set(options.existing ?? []);
  return {
    platform: 'linux',
    engine: engine(options.waiting, calls),
    mounts: {
      flushJournal: (id): Promise<void> => {
        calls.push(`flush ${id}`);
        return Promise.resolve();
      },
      unmount: (id): Promise<void> => {
        calls.push(`unmount ${id}`);
        return Promise.resolve();
      },
    },
    fs: {
      exists: (location) => Promise.resolve(existing.has(location)),
      rename: (from, to): Promise<void> => {
        calls.push(`rename ${from} -> ${to}`);
        return Promise.resolve();
      },
    },
  };
}

const LEAVE = { placementId: FIRST_ID, from: '/data/roms', to: '/data/roms' };

describe('Synced to Mounted only', () => {
  it('refuses while bytes wait to upload and leaves the engine running', async () => {
    const calls: string[] = [];
    const waiting = { needBytes: 2048, pendingOps: 0 };
    const result = await leaveSynced(ports({ waiting, calls }), LEAVE);
    expect(result).toEqual({ kind: 'refused', waiting });
    expect(calls).toEqual([]);
  });

  it('refuses while operations are pending', async () => {
    const waiting = { needBytes: 0, pendingOps: 3 };
    const result = await leaveSynced(ports({ waiting }), LEAVE);
    expect(result).toEqual({ kind: 'refused', waiting });
  });

  it('stops the engine then renames the local copy when the path is kept', async () => {
    const calls: string[] = [];
    const result = await leaveSynced(ports({ calls }), LEAVE);
    expect(result).toEqual({ kind: 'switched', localCopy: '/data/roms (local copy)' });
    expect(calls).toEqual([`stop ${FIRST_ID}`, 'rename /data/roms -> /data/roms (local copy)']);
  });

  it('picks the next free name when a local copy already exists', async () => {
    const result = await leaveSynced(
      ports({ existing: ['/data/roms (local copy)', '/data/roms (local copy 2)'] }),
      LEAVE,
    );
    expect(result).toEqual({ kind: 'switched', localCopy: '/data/roms (local copy 3)' });
  });

  it('leaves the files where they are when the mount goes to another path', async () => {
    const calls: string[] = [];
    const result = await leaveSynced(ports({ calls }), { ...LEAVE, to: '/mnt/roms' });
    expect(result).toEqual({ kind: 'switched', localCopy: null });
    expect(calls).toEqual([`stop ${FIRST_ID}`]);
  });

  it('treats a trailing separator as the same path', async () => {
    const result = await leaveSynced(ports({}), { ...LEAVE, to: '/data/roms/' });
    expect(result).toEqual({ kind: 'switched', localCopy: '/data/roms (local copy)' });
  });
});

describe('Mounted only to Synced', () => {
  it('flushes the journal, unmounts, then starts the first sync into the path', async () => {
    const calls: string[] = [];
    await joinSynced(ports({ calls }), {
      mountId: SECOND_ID,
      placementId: SECOND_ID,
      driveId: DRIVE_ID,
      localPath: '/data/roms',
      excluded: [],
      ignorePatterns: [],
      receiveOnly: false,
    });
    expect(calls).toEqual([`flush ${SECOND_ID}`, `unmount ${SECOND_ID}`, 'start /data/roms']);
  });

  it('does not start syncing when the unmount fails', async () => {
    const calls: string[] = [];
    const switchPorts = ports({ calls });
    const failing: SwitchPorts = {
      ...switchPorts,
      mounts: { ...switchPorts.mounts, unmount: () => Promise.reject(new Error('busy')) },
    };
    await expect(
      joinSynced(failing, {
        mountId: SECOND_ID,
        placementId: SECOND_ID,
        driveId: DRIVE_ID,
        localPath: '/data/roms',
        excluded: [],
        ignorePatterns: [],
        receiveOnly: false,
      }),
    ).rejects.toThrow('busy');
    expect(calls).toEqual([`flush ${SECOND_ID}`]);
  });
});
