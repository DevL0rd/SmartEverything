import type { DrivePlacement, DrivePlacementStatus } from '@smarteverything/domain';

export const FIXTURE_ID = '11111111-1111-4111-8111-111111111111';

export const FIXTURE_STATUS: DrivePlacementStatus = {
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
  reportedAt: '2026-11-14T00:00:00.000Z',
};

export function mountedPlacement(change: Partial<DrivePlacement> = {}): DrivePlacement {
  return {
    id: FIXTURE_ID,
    deviceId: FIXTURE_ID,
    rootId: FIXTURE_ID,
    folderItemId: null,
    mode: 'mounted',
    localPath: '/home/u/SmartEverything/My Drive',
    enabled: true,
    hold: null,
    createdBy: FIXTURE_ID,
    createdAt: '2026-11-14T00:00:00.000Z',
    status: FIXTURE_STATUS,
    ...change,
  };
}

export function syncedPlacement(
  localPath: string,
  change: Partial<DrivePlacement> = {},
): DrivePlacement {
  return {
    ...mountedPlacement(),
    mode: 'synced',
    excluded: [],
    ignorePatterns: [],
    conflictCopies: true,
    localPath,
    ...change,
  };
}
