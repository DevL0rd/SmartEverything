import { ApiError, type DriveItem } from '@smarteverything/domain';
import { inLockedFolder } from '../../drive/access';
import { isFileItem, type FileItem } from '../../drive/file-item';
import { storeUnit } from '../../store/host/unit';
import { DriveMediaRepository } from '../../store/repositories/drive-media';
import type { HostStore } from '../../store/host/host-store';

function hidden(): ApiError {
  return new ApiError('not_found', 'There is no such file for this caller.');
}

function heldBy(store: Pick<HostStore, 'driveRoots'>, profileId: string, item: DriveItem): boolean {
  const root = store.driveRoots.find(item.rootId);
  return inLockedFolder(item) && root?.scope === 'person' && root.ownerProfileId === profileId;
}

export interface LinkedItem {
  readonly item: FileItem;
  readonly playable: boolean;
}

export const PHOTO_LOCKED_LINK_TARGET_UNIT = storeUnit(
  (store, input: { readonly session: string; readonly itemId: string }): DriveItem => {
    const unlock = store.photoLocked.unlock(input.session);
    if (unlock === undefined) {
      throw new ApiError('link_expired', 'The Locked folder closed; unlock it again.');
    }
    const item = store.driveItems.find(input.itemId, unlock.profileId);
    if (item === undefined || !heldBy(store, unlock.profileId, item)) throw hidden();
    return item;
  },
);

export const PHOTO_LOCKED_LINK_ITEMS_UNIT = storeUnit(
  (
    store,
    input: { readonly profileId: string; readonly itemIds: readonly string[] },
  ): LinkedItem[] => {
    const media = new DriveMediaRepository(store.context);
    return [...new Set(input.itemIds)].map((itemId): LinkedItem => {
      const item = store.driveItems.find(itemId, input.profileId);
      if (item === undefined || !isFileItem(item) || !heldBy(store, input.profileId, item)) {
        throw new ApiError('not_found', 'Some of those photos are not in your Locked folder.');
      }
      return {
        item,
        playable: item.kind === 'video' && media.find(itemId)?.playable_state === 'ready',
      };
    });
  },
);
