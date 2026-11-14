import {
  DRIVE_ALBUM,
  DRIVE_GRANT,
  DRIVE_ROOT,
  type DriveAlbum,
  type DriveAlbumSurface,
  type DriveGrant,
  type DriveRoot,
  type LiveChange,
} from '@smarteverything/domain';

export const ROOT_ID = 'a1b2c3d4-0000-4000-8000-000000000001';
export const OTHER_ROOT_ID = 'a1b2c3d4-0000-4000-8000-000000000002';
export const FOLDER_ID = 'a1b2c3d4-0000-4000-8000-000000000003';
export const OTHER_FOLDER_ID = 'a1b2c3d4-0000-4000-8000-000000000004';
export const ALBUM_ID = 'a1b2c3d4-0000-4000-8000-000000000005';
export const OTHER_ALBUM_ID = 'a1b2c3d4-0000-4000-8000-000000000006';
export const OWNER_ID = 'a1b2c3d4-0000-4000-8000-000000000010';
export const MEMBER_ID = 'a1b2c3d4-0000-4000-8000-000000000011';
export const GRANT_ID = 'a1b2c3d4-0000-4000-8000-000000000012';
const AT = '2026-11-07T10:00:00.000Z';

export function rootRow(id: string, state: 'ready' | 'scanning'): DriveRoot {
  return DRIVE_ROOT.parse({
    id,
    scope: 'home',
    ownerProfileId: null,
    indexId: 'index',
    state,
    stateReason: null,
    items: 0,
    folders: 0,
    bytes: 0,
    scannedAt: null,
    health: {
      hashedShare: 0,
      verifiedShare: 0,
      corrupt: 0,
      lastScrubAt: null,
      lastBackupAt: null,
    },
    versions: false,
    skipPatterns: [],
    includeHidden: false,
  });
}

export function personalRootRow(id: string, ownerProfileId: string): DriveRoot {
  return { ...rootRow(id, 'ready'), scope: 'person', ownerProfileId };
}

export function grantRow(
  id: string,
  itemId: string,
  profileId: string,
  role: 'view' | 'edit',
): DriveGrant {
  return DRIVE_GRANT.parse({ id, itemId, profileId, role, grantedBy: OWNER_ID, createdAt: AT });
}

export function grantChange(
  operation: 'INSERT' | 'UPDATE' | 'DELETE',
  grant: DriveGrant,
  seq: number,
): LiveChange {
  return {
    type: 'change',
    table: 'drive_grants',
    operation,
    record: operation === 'DELETE' ? null : grant,
    oldRecord: operation === 'INSERT' ? null : grant,
    seq,
  };
}

export function albumRow(id: string, surface: DriveAlbumSurface = 'drive'): DriveAlbum {
  return DRIVE_ALBUM.parse({
    id,
    kind: 'manual',
    title: 'Trip',
    surface,
    scope: 'home',
    ownerProfileId: null,
    coverItemId: null,
    itemCount: 0,
    createdAt: AT,
    updatedAt: AT,
  });
}

export function rootChange(
  operation: 'INSERT' | 'UPDATE' | 'DELETE',
  before: DriveRoot | null,
  after: DriveRoot | null,
  seq: number,
): LiveChange {
  return { type: 'change', table: 'drive_roots', operation, record: after, oldRecord: before, seq };
}

export function albumChange(
  operation: 'INSERT' | 'UPDATE' | 'DELETE',
  album: DriveAlbum,
  seq: number,
): LiveChange {
  return {
    type: 'change',
    table: 'drive_albums',
    operation,
    record: operation === 'DELETE' ? null : album,
    oldRecord: operation === 'INSERT' ? null : album,
    seq,
  };
}
