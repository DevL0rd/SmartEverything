import { DriveMediaRepository } from '../../store/repositories/drive-media';
import { z } from 'zod';
import {
  API_ENDPOINTS as E,
  ApiError,
  type DriveItem,
  type DriveItemLink,
  type DriveRoot,
  type DriveTrashLink,
  type DriveTrashEntry,
} from '@smarteverything/domain';
import { decodeCursor, encodeCursor } from '../../drive/search';
import { lockedTrash, mayExport, type DriveActor } from '../../drive/access';
import { isFileItem } from '../../drive/file-item';
import { DRIVE_PAGE_SIZE } from '../../drive/service-read';
import type { Store } from '../../store/store';
import { driveFileLink, readableItem } from '../drive-files';
import { shortcutsForQuery } from '../../drive/social/shortcuts';
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
  | 'trashLinks'
  | 'recordDriveOpen'
  | 'searchDrive'
  | 'changeDrive'
  | 'readDriveStats'
  | 'listDuplicates'
  | 'listTrash';

const TRASH_CURSOR = z.strictObject({
  rootId: z.uuid(),
  after: z.strictObject({ deletedAt: z.string().min(1), itemId: z.string().min(1) }).nullable(),
});

function derivedLinks(
  links: DriveServices['files']['links'],
  item: DriveItem,
  playable: boolean,
): Pick<DriveItemLink, 'thumb' | 'playable' | 'preview'> {
  const ready = isFileItem(item) && item.thumb.state === 'ready';
  return {
    thumb: ready ? links.driveThumb(item.id, 'thumb', item.rev) : null,
    playable: playable ? links.driveThumb(item.id, 'playable', item.rev) : null,
    preview: ready ? links.driveThumb(item.id, 'preview', item.rev) : null,
  };
}

function linksOf(
  services: DriveServices,
  actor: DriveActor,
  itemIds: readonly string[],
  store: Store,
): DriveItemLink[] {
  return itemIds.map((itemId) => {
    const { item, access } = readableItem(services.files, actor, itemId);
    const exportable = mayExport(access, item.locked);
    const { links } = services.files;
    const playable =
      item.kind === 'video' &&
      new DriveMediaRepository(store.context).find(item.id)?.playable_state === 'ready';
    return {
      itemId,
      rev: item.rev,
      file: driveFileLink(services.files, actor, itemId),
      download: exportable && item.kind !== 'folder' ? links.driveDownload(itemId, item.rev) : null,
      icon:
        item.kind === 'folder' && item.iconHint ? links.driveFolderIcon(itemId, item.rev) : null,
      ...derivedLinks(links, item, playable),
    };
  });
}

function trashLinksOf(
  store: Store,
  services: DriveServices,
  actor: DriveActor,
  itemIds: readonly string[],
): DriveTrashLink[] {
  return itemIds.map((itemId) => {
    const entry = store.driveTrash.find(itemId);
    if (entry === undefined || lockedTrash(entry)) {
      throw new ApiError('not_found', 'There is no such trashed item for this caller.');
    }
    services.read.rootFor(actor, entry.rootId);
    const rev = store.driveTrash.thumbRev(itemId);
    return {
      itemId,
      thumb: rev === null ? null : services.files.links.driveThumb(itemId, 'thumb', rev),
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
    trashLinks: bound(E.trashLinks, ({ body, caller }) =>
      refusing(() => trashLinksOf(store, services, actorOf(store, caller), body.itemIds)),
    ),
    recordDriveOpen: bound(E.recordDriveOpen, ({ params, caller }) =>
      refusing(() => {
        services.read.recordOpen(actorOf(store, caller), params.itemId, store.context.now());
        return DONE_REPLY;
      }),
    ),
    searchDrive: bound(E.searchDrive, ({ body, caller }) =>
      refusing(() => {
        const actor = actorOf(store, caller);
        return {
          ...store.driveSearch.search(actor, body, DRIVE_PAGE_SIZE),
          shortcuts: shortcutsForQuery({ store, context: store.context }, actor, body),
        };
      }),
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
