import { describe, expect, it } from 'vitest';
import {
  COMPUTER_ROLE_MODELS,
  DRIVE_PLACEMENT,
  DRIVE_SYNC_CLIENT,
  type DiskSnapshot,
  type DrivePlacement,
  type DriveSyncClient,
} from '@smarteverything/domain';
import { bytes } from '../../../format/number';
import { deviceFixture } from '../../../store/device-fixture';
import type { Device } from '../../../store/state';
import {
  computersOf,
  computersSubtitleOf,
  filesLineOf,
  homeDiskOf,
  homeUsageOf,
  mountLineOf,
  osLineOf,
  seenTextOf,
  syncLineOf,
} from './computers-model';

const WORKSTATION = 'b0000000-0000-4000-8000-000000000001';
const LAPTOP = 'b0000000-0000-4000-8000-000000000002';
const ROOT = 'a0000000-0000-4000-8000-000000000001';
const OTHER_ROOT = 'a0000000-0000-4000-8000-000000000002';
const ME = 'c0000000-0000-4000-8000-000000000001';
const AT = '2026-11-07T10:00:00.000Z';
const NOW = Date.parse(AT);
const GB = 1e9;

function computer(id: string, label: string, patch: Partial<Device> = {}): Device {
  return deviceFixture(0, {
    id,
    kind: 'computer',
    name: label,
    model: COMPUTER_ROLE_MODELS.pc,
    details: { os: 'Linux' },
    ...patch,
  });
}

function client(patch: Partial<DriveSyncClient> = {}): DriveSyncClient {
  return DRIVE_SYNC_CLIENT.parse({
    clientId: 'd0000000-0000-4000-8000-000000000001',
    rootId: ROOT,
    deviceId: WORKSTATION,
    profileId: ME,
    enabled: true,
    selected: [],
    lastSeq: 4,
    lastSeenAt: AT,
    needBytes: 0,
    errors: [],
    ...patch,
  });
}

function placement(
  patch: Partial<DrivePlacement> = {},
  status: Partial<DrivePlacement['status']> = {},
): DrivePlacement {
  return DRIVE_PLACEMENT.parse({
    id: 'e0000000-0000-4000-8000-000000000001',
    deviceId: WORKSTATION,
    rootId: ROOT,
    folderItemId: null,
    mode: 'mounted',
    localPath: '/home/me/Drive',
    enabled: true,
    hold: null,
    createdBy: ME,
    createdAt: AT,
    status: {
      state: 'mounted',
      tier: 'full',
      basicLimits: null,
      readOnly: false,
      route: null,
      cacheBytes: 0,
      pinnedBytes: 0,
      openFiles: 0,
      pendingUploads: 0,
      reason: null,
      reportedAt: AT,
      ...status,
    },
    ...patch,
  });
}

function disk(mount: string, usedBytes: number, totalBytes: number): DiskSnapshot {
  return {
    mount,
    device: `/dev/${mount.length === 1 ? 'root' : 'data'}`,
    label: null,
    filesystem: 'ext4',
    usedBytes,
    totalBytes,
    readRate: 0,
    writeRate: 0,
    temperature: null,
  };
}

describe('computers on the Drive computers page', () => {
  it('lists computers without the hub, online first and then by name', () => {
    const hub = computer('b0000000-0000-4000-8000-000000000009', 'Hub', {
      model: COMPUTER_ROLE_MODELS.hub,
    });
    const office = computer('b0000000-0000-4000-8000-000000000003', 'Office PC', {
      online: false,
    });
    const laptop = computer(LAPTOP, 'Laptop');
    const plug = deviceFixture(1);
    const listed = computersOf([office, hub, plug, computer(WORKSTATION, 'Workstation'), laptop]);
    expect(listed.map((device) => device.label)).toEqual(['Laptop', 'Workstation', 'Office PC']);
    expect(computersSubtitleOf(listed)).toBe('3 computers · Office PC offline');
    expect(computersSubtitleOf(listed.slice(0, 2))).toBe('2 computers · all online');
    expect(computersSubtitleOf([])).toBeUndefined();
  });

  it('says the system, or Computer when the agent did not report it', () => {
    expect(osLineOf(computer(WORKSTATION, 'Workstation'))).toBe('Linux');
    expect(osLineOf(computer(WORKSTATION, 'Workstation', { details: {} }))).toBe('Computer');
  });

  it('counts the synced folders of the computer and says how far they are', () => {
    const device = computer(WORKSTATION, 'Workstation');
    expect(syncLineOf(device, [], [])).toEqual({ text: 'Not syncing', tone: null });
    const both = [client(), client({ rootId: OTHER_ROOT, needBytes: 2 * GB })];
    expect(syncLineOf(device, both, [])).toEqual({
      text: `2 folders · Syncing · ${bytes(2 * GB)} left`,
      tone: 'info',
    });
    expect(syncLineOf(device, [client({ deviceId: LAPTOP })], [])).toEqual({
      text: 'Not syncing',
      tone: null,
    });
    const offline = computer(WORKSTATION, 'Workstation', { online: false });
    expect(syncLineOf(offline, [client()], [])).toEqual({ text: '1 folder · Offline', tone: null });
  });

  it('describes the drive mount from the computer’s mounted placements', () => {
    expect(mountLineOf(WORKSTATION, [])).toEqual({ text: 'Not set up', tone: null });
    expect(
      mountLineOf(WORKSTATION, [placement({ mode: 'synced' }, { state: 'up_to_date' })]),
    ).toEqual({ text: 'Not set up', tone: null });
    expect(mountLineOf(LAPTOP, [placement()])).toEqual({ text: 'Not set up', tone: null });
    expect(mountLineOf(WORKSTATION, [placement({}, { readOnly: true })])).toEqual({
      text: 'Mounted only · Read only until write-back arrives',
      tone: 'positive',
    });
  });

  it('shows the worst of several mounts with the folder count', () => {
    const failed = placement(
      { id: 'e0000000-0000-4000-8000-000000000002', rootId: OTHER_ROOT },
      { state: 'failed', reason: 'The helper stopped' },
    );
    expect(mountLineOf(WORKSTATION, [placement(), failed])).toEqual({
      text: '2 folders · Failed · The helper stopped',
      tone: 'critical',
    });
  });

  it('says Now while online and the last moment it was seen otherwise', () => {
    expect(seenTextOf(true, null, NOW)).toBe('Now');
    expect(seenTextOf(false, null, NOW)).toBeNull();
    expect(seenTextOf(false, '2026-11-07T08:30:00.000Z', NOW)).toMatch(/^today /);
  });

  it('says whether its files can be browsed once the scopes are known', () => {
    expect(filesLineOf(undefined)).toBeNull();
    expect(filesLineOf(true)).toBe('You can browse its files');
    expect(filesLineOf(false)).toBe('Files are turned off on this computer');
  });

  it('measures the disk that holds the home folder, the deepest mount first', () => {
    const disks = [disk('/', 40 * GB, 100 * GB), disk('/home', 95 * GB, 100 * GB)];
    expect(homeDiskOf(disks, '/home/me')?.mount).toBe('/home');
    expect(homeDiskOf(disks, '/homework')?.mount).toBe('/');
    expect(homeDiskOf([disk('C:\\', 1, 2)], 'c:\\Users\\Me')?.mount).toBe('C:\\');
    expect(homeUsageOf(disks, '/home/me')).toEqual({
      mount: '/home',
      line: '95 GB of 100 GB',
      share: 0.95,
      tone: 'critical',
    });
    expect(homeUsageOf([], '/home/me')).toBeNull();
  });
});
