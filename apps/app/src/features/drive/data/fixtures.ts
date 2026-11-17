import {
  DRIVE_ACCESS_REQUEST,
  DRIVE_ALBUM,
  DRIVE_FILE_REQUEST,
  DRIVE_GRANT,
  DRIVE_ITEM,
  DRIVE_NOTIFICATION,
  DRIVE_OFFLINE_ITEM,
  DRIVE_ROOT,
  DRIVE_TRANSFER,
  LIVE_CHANGE,
  type DriveAccessRequest,
  type DriveAlbum,
  type DriveAlbumSurface,
  type DriveFileRequest,
  type DriveGrant,
  type DriveItem,
  type DriveNotification,
  type DriveOfflineItem,
  type DriveRoot,
  type DriveTransfer,
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
export const AT = '2026-11-07T10:00:00.000Z';

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
  return DRIVE_GRANT.parse({
    id,
    itemId,
    profileId,
    role,
    grantedBy: OWNER_ID,
    createdAt: AT,
    expiresAt: null,
  });
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

export type DriveItemPatch = Readonly<Record<string, unknown>>;

type DriveItemKind = DriveItem['kind'];

type ItemOfKind<K extends DriveItemKind> = Extract<DriveItem, { readonly kind: K }>;

const FIXTURE_NAME: Readonly<Record<DriveItemKind, string>> = {
  folder: 'Folder',
  image: 'Photo.jpg',
  video: 'Clip.mp4',
  audio: 'Memo.m4a',
  document: 'Plan.pdf',
  other: 'Archive.bin',
  link: 'Latest',
  special: 'Queue',
};

const FIXTURE_MIME: Readonly<
  Record<Exclude<DriveItemKind, 'folder' | 'link' | 'special'>, string>
> = {
  image: 'image/jpeg',
  video: 'video/mp4',
  audio: 'audio/mp4',
  document: 'application/pdf',
  other: 'application/octet-stream',
};

const FIXTURE_FILE = { bytes: 10, sha256: null, integrity: 'unknown', thumb: { state: 'none' } };

const FIXTURE_MEDIA = {
  takenAt: null,
  width: null,
  height: null,
  orientation: null,
  camera: null,
  exposure: null,
  place: null,
};

function kindFields(kind: DriveItemKind): Readonly<Record<string, unknown>> {
  switch (kind) {
    case 'folder':
      return {
        childCount: 0,
        bytes: 0,
        totalBytes: 0,
        totalFiles: 0,
        colour: null,
        iconHint: false,
      };
    case 'image':
      return { ...FIXTURE_FILE, ...FIXTURE_MEDIA, mime: FIXTURE_MIME.image };
    case 'video':
      return { ...FIXTURE_FILE, ...FIXTURE_MEDIA, mime: FIXTURE_MIME.video, durationMs: null };
    case 'audio':
      return { ...FIXTURE_FILE, mime: FIXTURE_MIME.audio, takenAt: null, durationMs: null };
    case 'document':
      return { ...FIXTURE_FILE, mime: FIXTURE_MIME.document };
    case 'other':
      return { ...FIXTURE_FILE, mime: FIXTURE_MIME.other };
    case 'link':
      return { bytes: 8, linkTarget: 'Plan.pdf' };
    case 'special':
      return { bytes: 0 };
  }
}

export function driveItemFixture(kind: DriveItemKind, patch: DriveItemPatch = {}): DriveItem {
  const named = patch['name'];
  const name = typeof named === 'string' ? named : FIXTURE_NAME[kind];
  return DRIVE_ITEM.parse({
    id: 'a1b2c3d4-0000-4000-8000-000000000100',
    rootId: ROOT_ID,
    parentId: FOLDER_ID,
    relPath: name,
    name,
    modifiedAt: AT,
    addedAt: AT,
    openedAt: null,
    starred: false,
    shared: false,
    locked: false,
    lockedHere: false,
    openComments: 0,
    rev: 1,
    etag: 'etag',
    outside: false,
    addedByProfileId: null,
    remoteId: null,
    remoteRev: null,
    ...kindFields(kind),
    ...patch,
    kind,
  });
}

function narrowed<K extends DriveItemKind>(
  item: DriveItem,
  kind: K,
  isKind: (item: DriveItem) => item is ItemOfKind<K>,
): ItemOfKind<K> {
  if (!isKind(item)) throw new TypeError(`the fixture is not a ${kind} item`);
  return item;
}

export function folderFixture(patch: DriveItemPatch = {}): ItemOfKind<'folder'> {
  return narrowed(
    driveItemFixture('folder', patch),
    'folder',
    (item): item is ItemOfKind<'folder'> => item.kind === 'folder',
  );
}

export function imageFixture(patch: DriveItemPatch = {}): ItemOfKind<'image'> {
  return narrowed(
    driveItemFixture('image', patch),
    'image',
    (item): item is ItemOfKind<'image'> => item.kind === 'image',
  );
}

export function videoFixture(patch: DriveItemPatch = {}): ItemOfKind<'video'> {
  return narrowed(
    driveItemFixture('video', patch),
    'video',
    (item): item is ItemOfKind<'video'> => item.kind === 'video',
  );
}

export function audioFixture(patch: DriveItemPatch = {}): ItemOfKind<'audio'> {
  return narrowed(
    driveItemFixture('audio', patch),
    'audio',
    (item): item is ItemOfKind<'audio'> => item.kind === 'audio',
  );
}

export function documentFixture(patch: DriveItemPatch = {}): ItemOfKind<'document'> {
  return narrowed(
    driveItemFixture('document', patch),
    'document',
    (item): item is ItemOfKind<'document'> => item.kind === 'document',
  );
}

export function otherFixture(patch: DriveItemPatch = {}): ItemOfKind<'other'> {
  return narrowed(
    driveItemFixture('other', patch),
    'other',
    (item): item is ItemOfKind<'other'> => item.kind === 'other',
  );
}

export const REQUESTER_ID = 'a1b2c3d4-0000-4000-8000-000000000013';
export const ITEM_ID = 'a1b2c3d4-0000-4000-8000-000000000100';
export const CLIENT_ID = 'a1b2c3d4-0000-4000-8000-000000000020';
export const ROW_ID = 'a1b2c3d4-0000-4000-8000-000000000200';
export const OTHER_ROW_ID = 'a1b2c3d4-0000-4000-8000-000000000201';

export function notificationRow(patch: Readonly<Record<string, unknown>> = {}): DriveNotification {
  return DRIVE_NOTIFICATION.parse({
    id: ROW_ID,
    profileId: MEMBER_ID,
    kind: 'shared',
    itemId: ITEM_ID,
    actorProfileId: OWNER_ID,
    actorName: null,
    refId: null,
    count: 1,
    createdAt: AT,
    updatedAt: AT,
    readAt: null,
    ...patch,
  });
}

export function accessRequestRow(
  patch: Readonly<Record<string, unknown>> = {},
): DriveAccessRequest {
  return DRIVE_ACCESS_REQUEST.parse({
    id: ROW_ID,
    itemId: ITEM_ID,
    itemName: 'Plan.pdf',
    requesterProfileId: REQUESTER_ID,
    ownerProfileId: OWNER_ID,
    role: 'view',
    message: null,
    state: 'pending',
    answeredBy: null,
    answeredAt: null,
    expiresAt: null,
    createdAt: AT,
    ...patch,
  });
}

export function fileRequestRow(patch: Readonly<Record<string, unknown>> = {}): DriveFileRequest {
  return DRIVE_FILE_REQUEST.parse({
    id: ROW_ID,
    folderItemId: FOLDER_ID,
    folderName: 'Taxes',
    createdBy: OWNER_ID,
    title: 'Send your receipts',
    message: null,
    expiresAt: null,
    closedAt: null,
    uploads: 0,
    bytes: 0,
    createdAt: AT,
    ...patch,
  });
}

export function transferRow(patch: Readonly<Record<string, unknown>> = {}): DriveTransfer {
  return DRIVE_TRANSFER.parse({
    id: ROW_ID,
    itemId: ITEM_ID,
    itemName: 'Plan.pdf',
    itemKind: 'document',
    bytes: 10,
    fromProfileId: OWNER_ID,
    toProfileId: MEMBER_ID,
    state: 'offered',
    createdAt: AT,
    answeredAt: null,
    ...patch,
  });
}

export function offlineRow(patch: Readonly<Record<string, unknown>> = {}): DriveOfflineItem {
  return DRIVE_OFFLINE_ITEM.parse({
    clientId: CLIENT_ID,
    itemId: ITEM_ID,
    profileId: MEMBER_ID,
    state: 'waiting',
    bytes: 0,
    syncedRev: null,
    error: null,
    updatedAt: AT,
    ...patch,
  });
}

export function tableChange(
  table: string,
  operation: 'INSERT' | 'UPDATE' | 'DELETE',
  record: unknown,
  seq: number,
): LiveChange {
  return LIVE_CHANGE.parse({
    type: 'change',
    table,
    operation,
    record: operation === 'DELETE' ? null : record,
    oldRecord: operation === 'INSERT' ? null : record,
    seq,
  });
}
