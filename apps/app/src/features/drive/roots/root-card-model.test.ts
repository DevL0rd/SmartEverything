import { describe, expect, it } from 'vitest';
import {
  DRIVE_CONFLICT,
  DRIVE_ROOT,
  DRIVE_SYNC_CLIENT,
  type DriveConflict,
  type DriveRoot,
  type DriveSyncClient,
} from '@smarteverything/domain';
import { bytes } from '../../../format/number';
import { ROOT_ID, rootRow } from '../../nas/data/fixtures';
import {
  haveShare,
  rootCardOf,
  rootVolumeOf,
  syncLineOf,
  type OpenRootConflicts,
  type SyncComputer,
} from './root-card-model';

const AT = '2026-11-07T10:00:00.000Z';
const GIB = 1024 ** 3;
const WORKSTATION = 'b0000000-0000-4000-8000-000000000001';
const LAPTOP = 'b0000000-0000-4000-8000-000000000002';
const OFFICE = 'b0000000-0000-4000-8000-000000000003';
const PROFILE = 'c0000000-0000-4000-8000-000000000001';

function client(
  deviceId: string,
  patch: Partial<Pick<DriveSyncClient, 'needBytes' | 'errors' | 'enabled'>> = {},
): DriveSyncClient {
  return DRIVE_SYNC_CLIENT.parse({
    clientId: deviceId.replace('b0000000', 'd0000000'),
    rootId: ROOT_ID,
    deviceId,
    profileId: PROFILE,
    enabled: true,
    selected: [],
    lastSeq: 1,
    lastSeenAt: AT,
    needBytes: 0,
    errors: [],
    ...patch,
  });
}

function conflict(deviceId: string, relPath: string): DriveConflict {
  return DRIVE_CONFLICT.parse({
    id: 'e0000000-0000-4000-8000-000000000001',
    rootId: ROOT_ID,
    itemId: 'e0000000-0000-4000-8000-000000000002',
    conflictItemId: 'e0000000-0000-4000-8000-000000000003',
    relPath,
    conflictRelPath: `${relPath}.conflict`,
    hubRev: 2,
    baseRev: 1,
    deviceId,
    profileId: PROFILE,
    at: AT,
    resolvedAt: null,
    resolution: null,
  });
}

const COMPUTERS: ReadonlyMap<string, SyncComputer> = new Map([
  [WORKSTATION, { deviceId: WORKSTATION, name: 'Workstation', online: true }],
  [LAPTOP, { deviceId: LAPTOP, name: 'Laptop', online: true }],
  [OFFICE, { deviceId: OFFICE, name: 'Office PC', online: false }],
]);

const NONE: OpenRootConflicts = { items: [], more: false };

function line(
  clients: readonly DriveSyncClient[],
  conflicts: OpenRootConflicts = NONE,
  computers: ReadonlyMap<string, SyncComputer> = COMPUTERS,
): ReturnType<typeof syncLineOf> {
  return syncLineOf({ rootBytes: 10 * GIB, clients, conflicts, computers });
}

describe('syncLineOf', () => {
  it('has no line when no computer syncs the folder', () => {
    expect(line([])).toBeNull();
    expect(line([client(LAPTOP, { enabled: false })])).toBeNull();
  });

  it('says up to date on every online computer', () => {
    const result = line([client(WORKSTATION), client(LAPTOP)]);
    expect(result).toMatchObject({ state: 'upToDate', tone: 'positive', ring: 1 });
    expect(result?.sentence).toBe('Up to date on 2 computers');
  });

  it('names the computer that is offline while the others are up to date', () => {
    const result = line([client(WORKSTATION), client(LAPTOP), client(OFFICE)]);
    expect(result?.sentence).toBe('Up to date on 2 of 3 · Office PC offline');
    expect(result?.computers.map((dot) => dot.state)).toEqual(['on', 'on', 'offline']);
  });

  it('says how much is left and where while syncing', () => {
    const result = line([client(WORKSTATION), client(LAPTOP, { needBytes: 2 * GIB })]);
    expect(result).toMatchObject({ state: 'syncing', tone: 'info' });
    expect(result?.sentence).toBe(`Laptop · ${bytes(2 * GIB)} left`);
    expect(result?.ring).toBeCloseTo(0.8);
    expect(result?.computers[1]).toMatchObject({
      tone: 'info',
      label: `Laptop, ${bytes(2 * GIB)} left`,
    });
  });

  it('counts the computers when several are catching up', () => {
    const result = line([
      client(WORKSTATION, { needBytes: GIB }),
      client(LAPTOP, { needBytes: GIB }),
    ]);
    expect(result?.sentence).toBe(`2 computers · ${bytes(2 * GIB)} left`);
  });

  it('says what waits when every computer is offline', () => {
    expect(line([client(OFFICE, { needBytes: GIB })])).toMatchObject({
      state: 'offline',
      tone: 'offline',
      sentence: `Offline · ${bytes(GIB)} waiting`,
    });
    expect(line([client(OFFICE)])?.sentence).toBe('Offline on 1 computer');
  });

  it('names the file and the computer for one conflict', () => {
    const result = line([client(WORKSTATION), client(LAPTOP)], {
      items: [conflict(LAPTOP, 'Budget/Budget 2027.xlsx')],
      more: false,
    });
    expect(result).toMatchObject({ state: 'conflict', tone: 'warning' });
    expect(result?.sentence).toBe('1 conflict on Laptop · Budget 2027.xlsx');
    expect(result?.computers.map((dot) => dot.tone)).toEqual(['positive', 'warning']);
  });

  it('counts conflicts and says when more are not loaded yet', () => {
    const two = [conflict(LAPTOP, 'a.txt'), conflict(WORKSTATION, 'b.txt')];
    expect(line([client(LAPTOP)], { items: two, more: false })?.sentence).toBe(
      '2 conflicts wait for you',
    );
    expect(line([client(LAPTOP)], { items: two, more: true })?.sentence).toBe(
      '2+ conflicts wait for you',
    );
  });

  it('puts a failure above every other state', () => {
    const failing = client(LAPTOP, {
      errors: [{ relPath: null, message: 'Disk full', at: AT }],
      needBytes: GIB,
    });
    const result = line([client(WORKSTATION), failing], {
      items: [conflict(LAPTOP, 'a.txt')],
      more: false,
    });
    expect(result).toMatchObject({
      state: 'failed',
      tone: 'critical',
      sentence: 'Sync failed on Laptop',
    });
  });

  it('shows a computer the app does not know as unknown and not online', () => {
    const result = line([client(LAPTOP)], NONE, new Map());
    expect(result?.state).toBe('offline');
    expect(result?.computers[0]).toMatchObject({ name: 'Unknown computer', state: 'unknown' });
  });
});

describe('haveShare', () => {
  it('is full with nothing needed and empty when the need is the whole folder or more', () => {
    expect(haveShare(100, 0)).toBe(1);
    expect(haveShare(100, 25)).toBe(0.75);
    expect(haveShare(0, 10)).toBe(0);
  });
});

function root(patch: Record<string, unknown>): DriveRoot {
  return DRIVE_ROOT.parse({ ...rootRow(ROOT_ID, 'ready'), ...patch });
}

describe('rootCardOf', () => {
  const volume = {
    mountId: 'm1',
    rootIds: [ROOT_ID],
    totalBytes: 100,
    freeBytes: 40,
    fullInMonths: null,
  };

  it('splits the disk into this folder and other files', () => {
    const model = rootCardOf(root({ bytes: 20, items: 1204 }), volume, []);
    expect(model.volume?.segments.map((segment) => segment.value)).toEqual([20, 40]);
    expect(model.volume?.total).toBe(100);
    expect(model.items).toBe('1,204 files');
    expect(model.subtitle).toBe('/data/photos');
    expect(model.mono).toBe(true);
  });

  it('draws kinds with bytes only and in the kind colours', () => {
    const model = rootCardOf(root({}), null, [
      { kind: 'image', items: 3, bytes: 30 },
      { kind: 'audio', items: 0, bytes: 0 },
      { kind: 'document', items: 1, bytes: 5 },
    ]);
    expect(model.kinds).toEqual([
      { label: 'Images', value: 30, colour: 'viz-1' },
      { label: 'Documents', value: 5, colour: 'viz-6' },
    ]);
    expect(model.volume).toBeNull();
  });

  it('says what is wrong with the folder', () => {
    expect(
      rootCardOf(root({ state: 'offline', stateReason: 'Disk unplugged' }), null, []).state,
    ).toMatchObject({
      text: 'Offline · Disk unplugged',
      tone: 'critical',
    });
    expect(rootCardOf(root({ state: 'scanning' }), null, []).state.tone).toBe('info');
    expect(rootCardOf(root({}), null, []).state.text).toBe('Watching for changes');
  });

  it('marks private and read-only folders', () => {
    const model = rootCardOf(
      root({ scope: 'person', ownerProfileId: PROFILE, readOnly: true }),
      null,
      [],
    );
    expect(model.badges.map((badge) => badge.label)).toEqual(['Private', 'Read only']);
  });

  it('finds the volume that holds the folder', () => {
    expect(rootVolumeOf([volume], ROOT_ID)).toBe(volume);
    expect(rootVolumeOf([volume], PROFILE)).toBeNull();
  });
});
