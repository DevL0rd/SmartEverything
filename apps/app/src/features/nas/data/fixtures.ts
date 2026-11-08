import {
  DRIVE_ALBUM,
  DRIVE_ROOT,
  type DriveAlbum,
  type DriveAlbumSurface,
  type DriveRoot,
  type LiveChange,
} from '@smarteverything/domain';

export const ROOT_ID = 'a1b2c3d4-0000-4000-8000-000000000001';
export const OTHER_ROOT_ID = 'a1b2c3d4-0000-4000-8000-000000000002';
export const FOLDER_ID = 'a1b2c3d4-0000-4000-8000-000000000003';
export const OTHER_FOLDER_ID = 'a1b2c3d4-0000-4000-8000-000000000004';
export const ALBUM_ID = 'a1b2c3d4-0000-4000-8000-000000000005';
export const OTHER_ALBUM_ID = 'a1b2c3d4-0000-4000-8000-000000000006';
const AT = '2026-11-07T10:00:00.000Z';

export function rootRow(
  id: string,
  state: 'ready' | 'scanning',
): Extract<DriveRoot, { readonly kind: 'folder' }> {
  return DRIVE_ROOT.unwrap().options[0].parse({
    id,
    kind: 'folder',
    label: 'Photos',
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
    inPhotos: false,
    skipPatterns: [],
    includeHidden: false,
    path: '/data/photos',
    synced: false,
    sync: { ignorePatterns: [], conflictCopies: false, clients: [] },
    readOnly: false,
    versions: false,
    volume: null,
  });
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
