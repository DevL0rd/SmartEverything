import { PHOTOS_CLIENT_PREFS, type DriveItem } from '@smarteverything/domain';
import { z } from 'zod';
import {
  canRead,
  inLockedFolder,
  itemAccess,
  lockedTrash,
  type DriveActor,
  type ItemAccess,
} from '../drive/access';
import { PHOTO_VISIBLE } from '../photos/membership';
import { storeUnit } from '../store/host/unit';
import { DriveMediaRepository } from '../store/repositories/drive-media';
import type { HostStore } from '../store/host/host-store';

const SHOWN = z.strictObject({ id: z.string() });

export interface ReadableAsk {
  readonly itemId: string;
  readonly actor: DriveActor | null;
}

export interface ReadableItem {
  readonly item: DriveItem;
  readonly rootPath: string;
  readonly access: ItemAccess | null;
}

function reach(
  store: HostStore,
  actor: DriveActor,
  root: Parameters<typeof itemAccess>[2],
  item: DriveItem,
): ItemAccess {
  const access = itemAccess(store, actor, root, item);
  if (canRead(access)) return access;
  const shown = store.context.sql.get(
    SHOWN,
    `select i.id from drive_items i join drive_roots r on r.id = i.root_id
      where i.id = $itemId and ${PHOTO_VISIBLE}`,
    { itemId: item.id, profile: actor.profileId },
  );
  return shown === undefined ? access : 'view';
}

function readableIn(store: HostStore, { itemId, actor }: ReadableAsk): ReadableItem | null {
  const item = store.driveItems.find(itemId, actor?.profileId ?? null);
  const root = item === undefined ? undefined : store.driveRoots.find(item.rootId);
  if (item === undefined || root === undefined || inLockedFolder(item)) return null;
  const access = actor === null ? null : reach(store, actor, root, item);
  return access !== null && !canRead(access) ? null : { item, rootPath: root.path, access };
}

export const DRIVE_SERVING_READ_UNITS = {
  driveRemovesLocation: storeUnit((store, { sharedBy }: { readonly sharedBy: string }) => {
    const read = store.personal.pref(PHOTOS_CLIENT_PREFS.photos, {
      clientId: sharedBy,
      profileId: sharedBy,
    });
    if (read.status === 'invalid') throw new Error(read.reason);
    return read.value.removeLocationOutside;
  }),
  driveReadable: storeUnit((store, ask: ReadableAsk) => readableIn(store, ask)),
  driveMediaRow: storeUnit((store, { itemId }: { readonly itemId: string }) =>
    new DriveMediaRepository(store.context).byId(itemId),
  ),
  driveMediaPlayable: storeUnit((store, { itemIds }: { readonly itemIds: readonly string[] }) => {
    const media = new DriveMediaRepository(store.context);
    return itemIds.filter((id) => media.find(id)?.playable_state === 'ready');
  }),
  driveTrashThumbRev: storeUnit((store, { itemId }: { readonly itemId: string }) => {
    const entry = store.driveTrash.find(itemId);
    return entry === undefined || lockedTrash(entry) ? null : store.driveTrash.thumbRev(itemId);
  }),
} as const;
