import {
  ApiError,
  type DriveActivityEntry,
  type DriveAlbum,
  type DriveAlbumSurface,
  type DriveFeedRow,
  type DriveItem,
  type DriveRecentPage,
  type DriveRoot,
  type DriveShortcut,
  type DriveSort,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { HostStore } from '../../store/host/host-store';
import type { StoredDrive } from '../../store/repositories/drive-roots';
import type { DriveChildrenMark } from '../../store/repositories/drive-item-sort';
import { storeUnit } from '../../store/host/unit';
import { canRead, canWrite, driveAccess, itemAccess, type DriveActor } from '../access';
import { DRIVE_PAGE_SIZE } from '../page-size';
import type {
  ActivityPage,
  BrowsePage,
  BrowseRequest,
  ItemPageRequest,
  RecentRequest,
  VersionPage,
} from '../service-read';
import { shortcutsInFolder } from './shortcuts';

export type ReadStore = Pick<
  HostStore,
  | 'driveRoots'
  | 'driveItems'
  | 'driveAlbums'
  | 'driveFeed'
  | 'driveGrants'
  | 'driveShortcuts'
  | 'driveRecent'
  | 'driveFileRequests'
  | 'driveOpens'
  | 'driveVersions'
>;

function revCursor(cursor: string | undefined): number | null {
  if (cursor === undefined) return null;
  const rev = Number(cursor);
  if (!Number.isSafeInteger(rev) || rev <= 0) {
    throw new ApiError('invalid_request', 'The cursor is not one this list gave out.');
  }
  return rev;
}

function cursorOf(cursor: string | undefined): number | null {
  if (cursor === undefined) {
    return null;
  }
  const seq = Number(cursor);
  if (!Number.isSafeInteger(seq) || seq <= 0) {
    throw new ApiError('invalid_request', 'The cursor is not one this list gave out.');
  }
  return seq;
}

const NAME_FIRST: DriveSort = { field: 'name', direction: 'asc' };

const MARK = z.tuple([z.union([z.string(), z.number()]), z.string(), z.string()]);

function sortOf(request: BrowseRequest): DriveSort {
  if (request.sortField === undefined || request.sortDirection === undefined) {
    return NAME_FIRST;
  }
  return { field: request.sortField, direction: request.sortDirection };
}

function badCursor(reason: string): ApiError {
  return new ApiError(
    'invalid_request',
    'The cursor is not one this folder listing gave out.',
    reason,
  );
}

function markOf(cursor: string | undefined, sort: DriveSort): DriveChildrenMark | null {
  if (cursor === undefined) {
    return null;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch (error) {
    throw badCursor(
      `Expected an encoded sort mark, received ${cursor}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const parsed = MARK.safeParse(raw);
  const expected = sort.field === 'bytes' ? 'number' : 'string';
  if (!parsed.success || typeof parsed.data[0] !== expected) {
    throw badCursor(`Expected a ${expected} mark for ${sort.field}, received ${cursor}.`);
  }
  const [key, name, id] = parsed.data;
  return { key, name, id };
}

function cursorOfMark(mark: DriveChildrenMark | null): string | null {
  return mark === null
    ? null
    : Buffer.from(JSON.stringify([mark.key, mark.name, mark.id]), 'utf8').toString('base64url');
}

function driveHidden(): ApiError {
  return new ApiError('not_found', 'There is no such drive for this person.');
}

function itemHidden(): ApiError {
  return new ApiError('not_found', 'There is no such file or folder.');
}

function clientDrive(drive: StoredDrive): DriveRoot {
  const { path: _path, ...root } = drive;
  return root;
}

export class DriveReadRules {
  constructor(private readonly store: ReadStore) {}

  listRoots(actor: DriveActor): DriveRoot[] {
    return this.store.driveRoots
      .list()
      .filter((drive) => driveAccess(actor, drive) !== 'none')
      .map(clientDrive);
  }

  rootFor(actor: DriveActor, rootId: string): StoredDrive {
    const drive = this.store.driveRoots.find(rootId);
    if (drive === undefined || driveAccess(actor, drive) === 'none') {
      throw driveHidden();
    }
    return drive;
  }

  rootOfItem(actor: DriveActor, item: DriveItem): StoredDrive {
    const drive = this.store.driveRoots.find(item.rootId);
    if (drive === undefined || !canRead(itemAccess(this.store, actor, drive, item))) {
      throw itemHidden();
    }
    return drive;
  }

  readItem(actor: DriveActor, itemId: string): DriveItem {
    const item = this.store.driveItems.find(itemId, actor.profileId);
    if (item === undefined) {
      throw itemHidden();
    }
    this.rootOfItem(actor, item);
    return item;
  }

  recordOpen(actor: DriveActor, itemId: string, at: string): void {
    const item = this.readItem(actor, itemId);
    if (item.kind === 'folder') {
      throw new ApiError('invalid_request', 'A folder is browsed, not opened.');
    }
    this.store.driveOpens.record(actor.profileId, item.id, at);
  }

  browseFolder(actor: DriveActor, request: BrowseRequest): BrowsePage {
    const sort = sortOf(request);
    const after = markOf(request.cursor, sort);
    const folder = request.folderId === undefined ? null : this.folderOf(actor, request);
    if (folder === null) {
      this.rootFor(actor, request.rootId);
    }
    const window = this.store.driveItems.sortedChildren({
      rootId: request.rootId,
      parentId: folder?.id ?? null,
      sort,
      after,
      limit: DRIVE_PAGE_SIZE,
      viewer: actor.profileId,
    });
    return {
      folder,
      items: window.entries.map((entry) => entry.item),
      shortcuts: this.shortcutsOf(actor, request, folder),
      next: cursorOfMark(window.next),
    };
  }

  listAlbums(actor: DriveActor, surface: DriveAlbumSurface): DriveAlbum[] {
    return this.store.driveAlbums.listVisibleTo(actor.profileId, surface);
  }

  readRecent(actor: DriveActor, request: RecentRequest): DriveRecentPage {
    return this.store.driveRecent.read(
      actor,
      { filter: request.filter, cursor: request.cursor ?? null },
      DRIVE_PAGE_SIZE,
    );
  }

  readActivity(
    actor: DriveActor,
    request: { readonly from: string; readonly cursor?: string | undefined },
  ): ActivityPage {
    const window = this.store.driveFeed.recentActivity({
      rootIds: this.listRoots(actor).map((root) => root.id),
      from: request.from,
      before: cursorOf(request.cursor),
      limit: DRIVE_PAGE_SIZE,
    });
    return {
      items: window.rows.map((row) => this.activityEntryOf(actor, row)),
      next: window.next === null ? null : String(window.next),
    };
  }

  itemVersions(actor: DriveActor, request: ItemPageRequest): VersionPage {
    this.readItem(actor, request.itemId);
    const window = this.store.driveVersions.forItem(
      request.itemId,
      revCursor(request.cursor),
      DRIVE_PAGE_SIZE,
    );
    return {
      items: window.versions,
      next: window.next === null ? null : String(window.next),
    };
  }

  itemActivity(actor: DriveActor, request: ItemPageRequest): ActivityPage {
    this.readItem(actor, request.itemId);
    const window = this.store.driveFeed.recentOfItem(
      request.itemId,
      revCursor(request.cursor),
      DRIVE_PAGE_SIZE,
    );
    return {
      items: window.rows.map((row) => this.activityEntryOf(actor, row)),
      next: window.next === null ? null : String(window.next),
    };
  }

  activityEntryOf(actor: DriveActor, row: DriveFeedRow): DriveActivityEntry {
    const item = this.store.driveItems.find(row.itemId, actor.profileId);
    return {
      row,
      outsiderName:
        row.via === 'share' && row.actorProfileId === null
          ? this.store.driveFileRequests.uploaderOf(row.itemId)
          : null,
      item:
        item === undefined
          ? null
          : {
              kind: item.kind,
              name: item.name,
              parentId: item.parentId,
              relPath: item.relPath,
            },
    };
  }

  private shortcutsOf(
    actor: DriveActor,
    request: BrowseRequest,
    folder: DriveItem | null,
  ): DriveShortcut[] {
    return request.cursor === undefined
      ? shortcutsInFolder(this.store, actor, request.rootId, folder?.id ?? null)
      : [];
  }

  private folderOf(actor: DriveActor, request: BrowseRequest): DriveItem {
    const folder =
      request.folderId === undefined
        ? undefined
        : this.store.driveItems.find(request.folderId, actor.profileId);
    if (folder?.kind !== 'folder' || folder.rootId !== request.rootId) {
      throw new ApiError('not_found', 'There is no such folder in this drive.');
    }
    this.rootOfItem(actor, folder);
    return folder;
  }
}

export interface ActorInput {
  readonly actor: DriveActor;
}

function rules(store: HostStore): DriveReadRules {
  return new DriveReadRules(store);
}

export const DRIVE_LIST_ROOTS_UNIT = storeUnit((store, input: ActorInput) =>
  rules(store).listRoots(input.actor),
);

export const DRIVE_ROOT_FOR_UNIT = storeUnit(
  (store, input: ActorInput & { readonly rootId: string }) =>
    rules(store).rootFor(input.actor, input.rootId),
);

export const DRIVE_ROOT_OF_ITEM_UNIT = storeUnit(
  (store, input: ActorInput & { readonly item: DriveItem }) =>
    rules(store).rootOfItem(input.actor, input.item),
);

export const DRIVE_READ_ITEM_UNIT = storeUnit(
  (store, input: ActorInput & { readonly itemId: string }) =>
    rules(store).readItem(input.actor, input.itemId),
);

export const DRIVE_READ_ITEM_ROOT_UNIT = storeUnit(
  (store, input: ActorInput & { readonly itemId: string }) => {
    const read = rules(store);
    const item = read.readItem(input.actor, input.itemId);
    return { item, root: read.rootOfItem(input.actor, item) };
  },
);

export const DRIVE_RECORD_OPEN_UNIT = storeUnit(
  (store, input: ActorInput & { readonly itemId: string; readonly at: string }) => {
    rules(store).recordOpen(input.actor, input.itemId, input.at);
  },
);

export const DRIVE_BROWSE_FOLDER_UNIT = storeUnit(
  (store, input: ActorInput & { readonly request: BrowseRequest }) =>
    rules(store).browseFolder(input.actor, input.request),
);

export const DRIVE_LIST_ALBUMS_UNIT = storeUnit(
  (store, input: ActorInput & { readonly surface: DriveAlbumSurface }) =>
    rules(store).listAlbums(input.actor, input.surface),
);

export const DRIVE_READ_RECENT_UNIT = storeUnit(
  (store, input: ActorInput & { readonly request: RecentRequest }) =>
    rules(store).readRecent(input.actor, input.request),
);

export const DRIVE_READ_ACTIVITY_UNIT = storeUnit(
  (
    store,
    input: ActorInput & {
      readonly request: { readonly from: string; readonly cursor?: string | undefined };
    },
  ) => rules(store).readActivity(input.actor, input.request),
);

export const DRIVE_ITEM_VERSIONS_UNIT = storeUnit(
  (store, input: ActorInput & { readonly request: ItemPageRequest }) =>
    rules(store).itemVersions(input.actor, input.request),
);

export function writableItemRootIn(
  store: Pick<HostStore, 'driveRoots' | 'driveItems' | 'driveGrants'>,
  actor: DriveActor,
  item: DriveItem,
): StoredDrive {
  const drive = store.driveRoots.byId(item.rootId);
  const access = itemAccess(store, actor, drive, item);
  if (access === 'none') {
    throw new ApiError('not_found', 'There is no such file or folder.');
  }
  if (!canWrite(access)) {
    throw new ApiError('forbidden', 'You can only view this; you cannot change it.');
  }
  return drive;
}

export const DRIVE_WRITABLE_ITEM_ROOT_UNIT = storeUnit(
  (store, input: ActorInput & { readonly item: DriveItem }) =>
    writableItemRootIn(store, input.actor, input.item),
);

export const DRIVE_ITEM_ACTIVITY_UNIT = storeUnit(
  (store, input: ActorInput & { readonly request: ItemPageRequest }) =>
    rules(store).itemActivity(input.actor, input.request),
);
