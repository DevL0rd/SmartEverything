import type { DriveRoot } from '@smarteverything/domain';
import type { DriveFolders } from '../../src/data-layout/drive-folders';

export const driveFolders: DriveFolders = {
  home: '/data/home/drive',
  people: { parent: '/data/people', leaf: 'drive' },
};

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
