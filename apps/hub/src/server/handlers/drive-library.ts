import { DriveMediaRepository } from '../../store/repositories/drive-media';
import { z } from 'zod';
import {
  API_ENDPOINTS as E,
  ApiError,
  type DriveItemLink,
  type DriveRoot,
  type DriveTrashEntry,
} from '@smarteverything/domain';
import { decodeCursor, encodeCursor } from '../../drive/search';
import type { DriveActor } from '../../drive/access';
import { DRIVE_PAGE_SIZE } from '../../drive/service-read';
import type { Store } from '../../store/store';
import { driveFileLink } from '../drive-files';
import { DONE_REPLY, bound, type Routes } from '../router';
import { refusing } from './drive-errors';
import {
  actorOf,
  callerOf,
  type DrivePage,
  type DriveServices,
  type RootPageQuery,
} from './drive-services';

type DriveLibraryRoute =
  | 'updateRoot'
  | 'scanRoot'
  | 'itemLinks'
  | 'searchDrive'
  | 'changeDrive'
  | 'readDriveStats'
  | 'listDuplicates'
  | 'listTrash';

const TRASH_CURSOR = z.strictObject({
  rootId: z.uuid(),
  after: z.strictObject({ deletedAt: z.string().min(1), itemId: z.string().min(1) }).nullable(),
});

function linksOf(
  services: DriveServices,
  actor: DriveActor,
  itemIds: readonly string[],
  store: Store,
): DriveItemLink[] {
  return itemIds.map((itemId) => {
    const item = services.read.readItem(actor, itemId);
    const file = driveFileLink(services.files, actor, itemId);
    const ready = item.kind !== 'folder' && item.thumb.state === 'ready';
    const { links } = services.files;
    return {
      itemId,
      rev: item.rev,
      file,
      thumb: ready ? links.driveThumb(itemId, 'thumb', item.rev) : null,
      playable:
        item.kind === 'video' &&
        new DriveMediaRepository(store.context).find(item.id)?.playable_state === 'ready'
          ? links.driveThumb(itemId, 'playable', item.rev)
          : null,
      preview: ready ? links.driveThumb(itemId, 'preview', item.rev) : null,
    };
  });
}

function trashRoots(
  services: DriveServices,
  actor: DriveActor,
  query: RootPageQuery,
): readonly DriveRoot[] {
  const roots =
    query.rootId === undefined
      ? services.read.listRoots(actor)
      : [services.read.rootFor(actor, query.rootId)];
  return roots.toSorted((left, right) => left.id.localeCompare(right.id));
}

function trashStart(
  roots: readonly DriveRoot[],
  cursor: z.infer<typeof TRASH_CURSOR> | null,
): number {
  if (cursor === null) return 0;
  const start = roots.findIndex((root) => root.id === cursor.rootId);
  if (start < 0) throw new ApiError('invalid_request', 'The cursor is not one this list gave out.');
  return start;
}

function trashPage(
  store: Store,
  services: DriveServices,
  actor: DriveActor,
  query: RootPageQuery,
): DrivePage<DriveTrashEntry> {
  const roots = trashRoots(services, actor, query);
  const cursor = query.cursor === undefined ? null : decodeCursor(TRASH_CURSOR, query.cursor);
  const first = trashStart(roots, cursor);
  const items: DriveTrashEntry[] = [];
  for (let index = first; index < roots.length; index += 1) {
    const root = roots[index];
    if (root === undefined) break;
    const after = index === first && cursor !== null ? cursor.after : null;
    const window = store.driveTrash.inRoot(root.id, after, DRIVE_PAGE_SIZE - items.length);
    items.push(...window.entries);
    if (window.next !== null) {
      return { items, next: encodeCursor({ rootId: root.id, after: window.next }) };
    }
    const following = roots[index + 1];
    if (items.length >= DRIVE_PAGE_SIZE) {
      return {
        items,
        next: following === undefined ? null : encodeCursor({ rootId: following.id, after: null }),
      };
    }
  }
  return { items, next: null };
}

export function driveLibraryRoutes(
  store: Store,
  services: DriveServices,
): Routes<DriveLibraryRoute> {
  const { write } = services;
  return {
    updateRoot: bound(E.updateRoot, ({ params, body, caller }) =>
      refusing(() => write.updateRoot(callerOf(store, caller), params.rootId, body)),
    ),
    scanRoot: bound(E.scanRoot, ({ params, caller }) =>
      refusing(() => {
        write.scanRoot(callerOf(store, caller), params.rootId);
        return DONE_REPLY;
      }),
    ),
    itemLinks: bound(E.itemLinks, ({ body, caller }) =>
      refusing(() => linksOf(services, actorOf(store, caller), body.itemIds, store)),
    ),
    searchDrive: bound(E.searchDrive, ({ body, caller }) =>
      refusing(() => store.driveSearch.search(actorOf(store, caller), body, DRIVE_PAGE_SIZE)),
    ),
    changeDrive: bound(E.changeDrive, ({ body, caller }) =>
      refusing(() => write.change(callerOf(store, caller), body)),
    ),
    readDriveStats: bound(E.readDriveStats, ({ caller }) =>
      store.driveStats.read(actorOf(store, caller), services.dataSpace),
    ),
    listDuplicates: bound(E.listDuplicates, ({ query, caller }) =>
      refusing(() => services.listings.duplicates(actorOf(store, caller), query)),
    ),
    listTrash: bound(E.listTrash, ({ query, caller }) =>
      refusing(() => trashPage(store, services, actorOf(store, caller), query)),
    ),
  };
}
