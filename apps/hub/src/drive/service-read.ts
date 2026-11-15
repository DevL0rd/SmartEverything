import {
  ApiError,
  type DriveActivityEntry,
  type DriveAlbum,
  type DriveAlbumSurface,
  type DriveFeedRow,
  type DriveItem,
  type DriveRecentFilter,
  type DriveRecentPage,
  type DriveRoot,
  type DriveShortcut,
  type DriveSort,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { Store } from '../store/store';
import type { StoredDrive } from '../store/repositories/drive-roots';
import type { DriveChildrenMark } from '../store/repositories/drive-item-sort';
import { canRead, driveAccess, itemAccess, type DriveActor } from './access';
import { shortcutsInFolder } from './social/shortcuts';

export const DRIVE_PAGE_SIZE = 200;

export interface BrowseRequest {
  readonly rootId: string;
  readonly folderId?: string | undefined;
  readonly sortField?: DriveSort['field'] | undefined;
  readonly sortDirection?: DriveSort['direction'] | undefined;
  readonly cursor?: string | undefined;
}

export interface BrowsePage {
  readonly folder: DriveItem | null;
  readonly items: readonly DriveItem[];
  readonly shortcuts: readonly DriveShortcut[];
  readonly next: string | null;
}

export interface RecentRequest {
  readonly filter: DriveRecentFilter;
  readonly cursor?: string | undefined;
}

type ReadStore = Pick<
  Store,
  | 'driveRoots'
  | 'driveItems'
  | 'driveAlbums'
  | 'driveFeed'
  | 'driveGrants'
  | 'driveShortcuts'
  | 'driveRecent'
  | 'driveFileRequests'
  | 'driveOpens'
>;

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

export class DriveReadService {
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
  ): { readonly items: readonly DriveActivityEntry[]; readonly next: string | null } {
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
