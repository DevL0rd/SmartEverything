import {
  ApiError,
  type DriveAlbum,
  type DriveItem,
  type DriveShare,
  type DriveShareCreate,
} from '@smarteverything/domain';
import type { DriveAlbumCursor } from '../../store/repositories/drive-albums';
import type { DriveItemWindow } from '../../store/repositories/drive-items';
import type { HostStore } from '../../store/host/host-store';
import { storeUnit } from '../../store/host/unit';
import {
  canRead,
  canShare,
  inLockedFolder,
  itemAccess,
  type DriveActor,
  type ItemAccess,
} from '../access';
import { readDriveSettings } from './settings';
import type { ShareActor } from '../shares';

type SharesStore = Pick<
  HostStore,
  'driveShares' | 'driveItems' | 'driveRoots' | 'driveGrants' | 'driveAlbums' | 'settingsKv'
>;

export type ShareTarget =
  | { readonly kind: 'item'; readonly item: DriveItem }
  | { readonly kind: 'album'; readonly album: DriveAlbum };

export interface ShareTargetFound {
  readonly target: ShareTarget;
  readonly linksAllowed: boolean;
}

export interface ShareRecordData {
  readonly share: DriveShare;
  readonly passwordHash: string | null;
}

export type ShareOpened =
  | {
      readonly kind: 'item';
      readonly share: DriveShare;
      readonly passwordHash: string | null;
      readonly item: DriveItem;
    }
  | {
      readonly kind: 'album';
      readonly share: DriveShare;
      readonly passwordHash: string | null;
      readonly album: DriveAlbum;
    }
  | { readonly kind: 'unavailable' };

export interface ShareWithinInput {
  readonly entry:
    | { readonly kind: 'item'; readonly item: DriveItem }
    | { readonly kind: 'album'; readonly albumId: string };
  readonly itemId: string;
}

export interface ShareAlbumWindow {
  readonly items: readonly DriveItem[];
  readonly next: DriveAlbumCursor | null;
}

function accessTo(store: SharesStore, actor: DriveActor, item: DriveItem): ItemAccess {
  return itemAccess(store, actor, store.driveRoots.byId(item.rootId), item);
}

function visibleItem(store: SharesStore, actor: DriveActor, itemId: string): DriveItem {
  const item = store.driveItems.find(itemId, actor.profileId);
  if (item === undefined || inLockedFolder(item) || !canRead(accessTo(store, actor, item))) {
    throw new ApiError('not_found', 'There is no such file or folder for this caller.');
  }
  return item;
}

export function linksAllowed(store: Pick<HostStore, 'settingsKv'>, actor: ShareActor): boolean {
  return actor.owner || readDriveSettings(store).membersMayShare;
}

function targetOf(store: SharesStore, actor: ShareActor, input: DriveShareCreate): ShareTarget {
  if (input.albumId !== undefined) {
    const album = store.driveAlbums.find(input.albumId);
    if (
      album?.surface !== 'photos' ||
      album.kind !== 'manual' ||
      album.ownerProfileId !== actor.profileId
    ) {
      throw new ApiError('not_found', 'There is no such album of this person to share.');
    }
    if (store.driveAlbums.contributions.unexposedCount(album.id) > 0) {
      throw new ApiError(
        'invalid_request',
        'This album holds photos that belong to someone else, so it cannot be shared.',
      );
    }
    return { kind: 'album', album };
  }
  if (input.itemId === undefined) {
    throw new ApiError('invalid_request', 'Name an item or an album to share.');
  }
  const item = visibleItem(store, actor, input.itemId);
  if (!canShare(accessTo(store, actor, item))) {
    throw new ApiError('forbidden', 'Only the person whose drive this is can share it.');
  }
  return { kind: 'item', item };
}

function shareTarget(
  store: SharesStore,
  input: { readonly actor: ShareActor; readonly create: DriveShareCreate },
): ShareTargetFound {
  return {
    target: targetOf(store, input.actor, input.create),
    linksAllowed: linksAllowed(store, input.actor),
  };
}

function sharesOfItem(
  store: SharesStore,
  input: { readonly actor: DriveActor; readonly itemId: string },
): DriveShare[] {
  const item = visibleItem(store, input.actor, input.itemId);
  const sharedDrive = store.driveRoots.byId(item.rootId).scope === 'home';
  return store.driveShares
    .forItem(input.itemId)
    .filter((share) => sharedDrive || share.createdBy === input.actor.profileId);
}

function revokeShare(
  store: SharesStore,
  input: { readonly actor: DriveActor; readonly shareId: string; readonly at: string },
): DriveShare {
  const share = store.driveShares.find(input.shareId);
  const itemId = share?.itemId ?? null;
  const item = itemId === null ? undefined : store.driveItems.find(itemId, null);
  const sharedDrive = item !== undefined && store.driveRoots.byId(item.rootId).scope === 'home';
  if (share === undefined || !(sharedDrive || share.createdBy === input.actor.profileId)) {
    throw new ApiError('not_found', 'There is no such share link for this caller.');
  }
  return store.driveShares.revoke(share.id, input.at);
}

function openShare(store: SharesStore, input: { readonly tokenHash: string }): ShareOpened {
  const record = store.driveShares.byTokenHash(input.tokenHash);
  if (record === undefined) return { kind: 'unavailable' };
  const { share, passwordHash } = record;
  if (share.albumId !== null) {
    const album = store.driveAlbums.find(share.albumId);
    if (album === undefined) return { kind: 'unavailable' };
    return { kind: 'album', share, passwordHash, album };
  }
  const item = share.itemId === null ? undefined : store.driveItems.find(share.itemId, null);
  if (item === undefined || inLockedFolder(item)) return { kind: 'unavailable' };
  return { kind: 'item', share, passwordHash, item };
}

function inAlbum(store: SharesStore, albumId: string, itemId: string): DriveItem | null {
  const item = store.driveItems.find(itemId, null);
  const member = store.driveAlbums.contributions.exposes(albumId, itemId);
  if (item === undefined || item.kind === 'folder' || !member || inLockedFolder(item)) {
    return null;
  }
  return item;
}

function inFolder(store: SharesStore, folder: DriveItem, itemId: string): DriveItem | null {
  if (itemId === folder.id) return folder;
  const child = store.driveItems.find(itemId, null);
  const inside =
    child !== undefined &&
    folder.kind === 'folder' &&
    child.rootId === folder.rootId &&
    !inLockedFolder(child) &&
    child.relPath.startsWith(`${folder.relPath}/`);
  return inside ? child : null;
}

function shareWithin(store: SharesStore, input: ShareWithinInput): DriveItem | null {
  const { entry, itemId } = input;
  return entry.kind === 'album'
    ? inAlbum(store, entry.albumId, itemId)
    : inFolder(store, entry.item, itemId);
}

function shareRootPath(store: SharesStore, input: { readonly rootId: string }): string | null {
  return store.driveRoots.find(input.rootId)?.path ?? null;
}

function shareAlbumItems(
  store: SharesStore,
  input: {
    readonly albumId: string;
    readonly after: DriveAlbumCursor | null;
    readonly limit: number;
  },
): ShareAlbumWindow {
  const window = store.driveAlbums.members(input.albumId, input.after, input.limit);
  const items = window.members.flatMap((member) => {
    const item = store.driveItems.find(member.itemId, null);
    return item === undefined ||
      item.kind === 'folder' ||
      inLockedFolder(item) ||
      !store.driveAlbums.contributions.exposes(input.albumId, item.id)
      ? []
      : [item];
  });
  return { items, next: window.next };
}

function shareChildren(
  store: SharesStore,
  input: {
    readonly rootId: string;
    readonly parentId: string;
    readonly after: string | null;
    readonly limit: number;
  },
): DriveItemWindow {
  return store.driveItems.children({ ...input, viewer: null });
}

export interface SharesMadeByInput {
  readonly actor: DriveActor;
  readonly itemId: string | undefined;
  readonly albumId: string | undefined;
  readonly cursor: string | undefined;
  readonly limit: number;
}

function sharesMadeBy(store: SharesStore, input: SharesMadeByInput): DriveShare[] {
  const { actor, cursor } = input;
  let after: { readonly at: string; readonly id: string } | null = null;
  if (cursor !== undefined) {
    const share = store.driveShares.find(cursor);
    if (share?.createdBy !== actor.profileId) {
      throw new ApiError('invalid_request', 'The cursor is not one this list gave out.');
    }
    after = { at: store.driveShares.createdAt(cursor), id: cursor };
  }
  return store.driveShares.madeBy({
    createdBy: actor.profileId,
    itemId: input.itemId,
    albumId: input.albumId,
    after,
    limit: input.limit,
  });
}

export const DRIVE_SHARES_MADE_BY_UNIT = storeUnit(sharesMadeBy);

export const DRIVE_SHARE_TARGET_UNIT = storeUnit(shareTarget);

export const DRIVE_SHARES_OF_ITEM_UNIT = storeUnit(sharesOfItem);

export const DRIVE_SHARE_REVOKE_UNIT = storeUnit(revokeShare);

export const DRIVE_SHARE_OPEN_UNIT = storeUnit(openShare);

export const DRIVE_SHARE_WITHIN_UNIT = storeUnit(shareWithin);

export const DRIVE_SHARE_ROOT_PATH_UNIT = storeUnit(shareRootPath);

export const DRIVE_SHARE_ALBUM_ITEMS_UNIT = storeUnit(shareAlbumItems);

export const DRIVE_SHARE_CHILDREN_UNIT = storeUnit(shareChildren);

export const DRIVE_SHARE_LINKS_ALLOWED_UNIT = storeUnit((store, input: ShareActor) =>
  linksAllowed(store, input),
);
