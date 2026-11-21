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
import { DRIVE_PAGE_SIZE } from '../../drive/page-size';
import type { Store } from '../../store/store';
import { driveFileLink, readableItem } from '../drive-files';
import { shortcutsForQuery } from '../../drive/social/shortcuts';
import { readDriveStats } from '../../drive/stats';
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

async function linksOf(
  services: DriveServices,
  actor: DriveActor,
  itemIds: readonly string[],
  store: Store,
): Promise<DriveItemLink[]> {
  const located = await Promise.all(
    itemIds.map(async (itemId) => ({
      itemId,
      ...(await readableItem(services.files, actor, itemId)),
      file: await driveFileLink(services.files, actor, itemId),
    })),
  );
  const playable = new Set(
    await store.host.read('driveMediaPlayable', {
      itemIds: located.filter(({ item }) => item.kind === 'video').map(({ item }) => item.id),
    }),
  );
  const { links } = services.files;
  return located.map(({ itemId, item, access, file }) => {
    const exportable = mayExport(access, item.locked);
    return {
      itemId,
      rev: item.rev,
      file,
      download: exportable && item.kind !== 'folder' ? links.driveDownload(itemId, item.rev) : null,
      icon:
        item.kind === 'folder' && item.iconHint ? links.driveFolderIcon(itemId, item.rev) : null,
      ...derivedLinks(links, item, playable.has(item.id)),
    };
  });
}

async function trashLinksOf(
  store: Store,
  services: DriveServices,
  actor: DriveActor,
  itemIds: readonly string[],
): Promise<DriveTrashLink[]> {
  const links: DriveTrashLink[] = [];
  for (const itemId of itemIds) {
    const entry = await store.host.call('driveTrash', 'find', itemId);
    if (entry === undefined || lockedTrash(entry)) {
      throw new ApiError('not_found', 'There is no such trashed item for this caller.');
    }
    await services.read.rootFor(actor, entry.rootId);
    const rev = await store.host.call('driveTrash', 'thumbRev', itemId);
    links.push({
      itemId,
      thumb: rev === null ? null : services.files.links.driveThumb(itemId, 'thumb', rev),
    });
  }
  return links;
}

async function trashRoots(
  services: DriveServices,
  actor: DriveActor,
  query: RootPageQuery,
): Promise<readonly DriveRoot[]> {
  const roots =
    query.rootId === undefined
      ? await services.read.listRoots(actor)
      : [await services.read.rootFor(actor, query.rootId)];
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

async function trashPage(
  store: Store,
  services: DriveServices,
  actor: DriveActor,
  query: RootPageQuery,
): Promise<DrivePage<DriveTrashEntry>> {
  const roots = await trashRoots(services, actor, query);
  const cursor = query.cursor === undefined ? null : decodeCursor(TRASH_CURSOR, query.cursor);
  const first = trashStart(roots, cursor);
  const items: DriveTrashEntry[] = [];
  for (let index = first; index < roots.length; index += 1) {
    const root = roots[index];
    if (root === undefined) break;
    const after = index === first && cursor !== null ? cursor.after : null;
    const window = await store.host.call(
      'driveTrash',
      'inRoot',
      root.id,
      after,
      DRIVE_PAGE_SIZE - items.length,
    );
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
      refusing(() => write.updateRoot(callerOf(caller), params.rootId, body)),
    ),
    scanRoot: bound(E.scanRoot, ({ params, caller }) =>
      refusing(async () => {
        await write.scanRoot(callerOf(caller), params.rootId);
        return DONE_REPLY;
      }),
    ),
    itemLinks: bound(E.itemLinks, ({ body, caller }) =>
      refusing(() => linksOf(services, actorOf(caller), body.itemIds, store)),
    ),
    trashLinks: bound(E.trashLinks, ({ body, caller }) =>
      refusing(() => trashLinksOf(store, services, actorOf(caller), body.itemIds)),
    ),
    recordDriveOpen: bound(E.recordDriveOpen, ({ params, caller }) =>
      refusing(async () => {
        await services.read.recordOpen(actorOf(caller), params.itemId, store.now().toISOString());
        return DONE_REPLY;
      }),
    ),
    searchDrive: bound(E.searchDrive, ({ body, caller }) =>
      refusing(async () => {
        const actor = actorOf(caller);
        return {
          ...(await store.host.call('driveSearch', 'search', actor, body, DRIVE_PAGE_SIZE)),
          shortcuts: await shortcutsForQuery(store, actor, body),
        };
      }),
    ),
    changeDrive: bound(E.changeDrive, ({ body, caller }) =>
      refusing(() => write.change(callerOf(caller), body)),
    ),
    readDriveStats: bound(E.readDriveStats, ({ caller }) =>
      readDriveStats(store, actorOf(caller), services.dataSpace),
    ),
    listDuplicates: bound(E.listDuplicates, ({ query, caller }) =>
      refusing(() => services.listings.duplicates(actorOf(caller), query)),
    ),
    listTrash: bound(E.listTrash, ({ query, caller }) =>
      refusing(() => trashPage(store, services, actorOf(caller), query)),
    ),
  };
}
