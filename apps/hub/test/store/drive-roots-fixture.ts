import type { DriveRoot, DriveRootScope } from '@smarteverything/domain';

export function drivePathOf(scope: DriveRootScope, ownerProfileId: string | null): string {
  return scope === 'home' ? '/data/home/drive' : `/data/people/${String(ownerProfileId)}/drive`;
}

const HEALTH = {
  hashedShare: 0,
  verifiedShare: 0,
  corrupt: 0,
  lastScrubAt: null,
  lastBackupAt: null,
} as const;

function base(id: string): Omit<DriveRoot, 'scope' | 'ownerProfileId'> {
  return {
    id,
    indexId: `index-${id}`,
    state: 'ready',
    stateReason: null,
    items: 0,
    folders: 0,
    bytes: 0,
    scannedAt: null,
    health: HEALTH,
    versions: true,
    skipPatterns: [],
    includeHidden: false,
  };
}

export function sharedDriveRoot(id: string, fields: Partial<DriveRoot> = {}): DriveRoot {
  return { ...base(id), scope: 'home', ownerProfileId: null, ...fields };
}

export function personalDriveRoot(
  id: string,
  ownerProfileId: string,
  fields: Partial<DriveRoot> = {},
): DriveRoot {
  return { ...base(id), scope: 'person', ownerProfileId, ...fields };
}
