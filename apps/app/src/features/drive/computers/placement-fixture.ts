import {
  COMPUTER_ROLE_MODELS,
  DRIVE_PLACEMENT,
  type DrivePlacement,
} from '@smarteverything/domain';
import { deviceFixture } from '../../../store/device-fixture';
import type { Device } from '../../../store/state';

export const WORKSTATION = 'b0000000-0000-4000-8000-000000000001';
export const LAPTOP = 'b0000000-0000-4000-8000-000000000002';
export const ROOT = 'a0000000-0000-4000-8000-000000000001';
export const OTHER_ROOT = 'a0000000-0000-4000-8000-000000000002';
export const FOLDER = 'a0000000-0000-4000-8000-000000000003';
export const ME = 'c0000000-0000-4000-8000-000000000001';
export const AT = '2026-11-07T10:00:00.000Z';
export const NOW = Date.parse(AT);
export const GB = 1e9;

export function computer(id: string, label: string, patch: Partial<Device> = {}): Device {
  return deviceFixture(0, {
    id,
    kind: 'computer',
    name: label,
    model: COMPUTER_ROLE_MODELS.pc,
    details: { os: 'Linux' },
    ...patch,
  });
}

const SYNCED = { excluded: [], ignorePatterns: [], conflictCopies: true } as const;

export function placement(
  patch: Partial<DrivePlacement> = {},
  status: Partial<DrivePlacement['status']> = {},
): DrivePlacement {
  const mode = patch.mode ?? 'mounted';
  return DRIVE_PLACEMENT.parse({
    id: 'e0000000-0000-4000-8000-000000000001',
    deviceId: WORKSTATION,
    rootId: ROOT,
    folderItemId: null,
    mode,
    localPath: mode === 'synced' ? '/home/me/Drive' : null,
    mountName: mode === 'synced' ? null : 'Drive',
    enabled: true,
    hold: null,
    createdBy: ME,
    createdAt: AT,
    ...(mode === 'synced' ? SYNCED : {}),
    status: {
      state: mode === 'synced' ? 'up_to_date' : 'mounted',
      tier: mode === 'synced' ? null : 'full',
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
      mountPoint: null,
      reportedAt: AT,
      ...status,
    },
    ...patch,
  });
}
