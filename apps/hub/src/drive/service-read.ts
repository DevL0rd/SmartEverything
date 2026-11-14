import {
  ApiError,
  type DriveActivityEntry,
  type DriveAlbum,
  type DriveAlbumSurface,
  type DriveFeedOp,
  type DriveItem,
  type DriveRecentEntry,
  type DriveRecentFilter,
  type DriveRecentPage,
  type DriveRoot,
} from '@smarteverything/domain';
import type { Store } from '../store/store';
import type { StoredDrive } from '../store/repositories/drive-roots';
import { canRead, driveAccess, itemAccess, type DriveActor } from './access';

export const DRIVE_PAGE_SIZE = 200;

export interface BrowseRequest {
  readonly rootId: string;
  readonly folderId?: string | undefined;
  readonly sortField?: string | undefined;
  readonly sortDirection?: string | undefined;
  readonly cursor?: string | undefined;
}

export interface BrowsePage {
  readonly folder: DriveItem | null;
  readonly items: readonly DriveItem[];
  readonly next: string | null;
}

export interface RecentRequest {
  readonly filter: DriveRecentFilter;
  readonly cursor?: string | undefined;
}

type ReadStore = Pick<
  Store,
  'driveRoots' | 'driveItems' | 'driveAlbums' | 'driveFeed' | 'driveGrants'
>;

const ADDED_OPS: readonly DriveFeedOp[] = ['create'];
const CHANGED_OPS: readonly DriveFeedOp[] = ['update', 'rename', 'move', 'restore'];
const EVERYTHING_OPS: readonly DriveFeedOp[] = [...ADDED_OPS, ...CHANGED_OPS];

function opsOf(filter: DriveRecentFilter): readonly DriveFeedOp[] {
  switch (filter) {
    case 'added':
      return ADDED_OPS;
    case 'changed':
      return CHANGED_OPS;
    case 'everything':
      return EVERYTHING_OPS;
    case 'opened':
      throw new ApiError(
        'invalid_request',
        'Recently opened files are not available yet; the item store keeps no opened order.',
      );
  }
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

  browseFolder(actor: DriveActor, request: BrowseRequest): BrowsePage {
    if (request.sortField !== undefined && !this.namedAscending(request)) {
      throw new ApiError(
        'invalid_request',
        'Folders can only be listed by name, ascending, for now.',
      );
    }
    const folder = request.folderId === undefined ? null : this.folderOf(actor, request);
    if (folder === null) {
      this.rootFor(actor, request.rootId);
    }
    const window = this.store.driveItems.children({
      rootId: request.rootId,
      parentId: folder?.id ?? null,
      after: request.cursor ?? null,
      limit: DRIVE_PAGE_SIZE,
      viewer: actor.profileId,
    });
    return { folder, items: window.entries.map((entry) => entry.item), next: window.next };
  }

  listAlbums(actor: DriveActor, surface: DriveAlbumSurface): DriveAlbum[] {
    return this.store.driveAlbums.listVisibleTo(actor.profileId, surface);
  }

  readRecent(actor: DriveActor, request: RecentRequest): DriveRecentPage {
    const window = this.store.driveFeed.latest(
      opsOf(request.filter),
      cursorOf(request.cursor),
      DRIVE_PAGE_SIZE,
    );
    const entries = window.rows.flatMap((row): DriveRecentEntry[] => {
      const item = this.store.driveItems.find(row.itemId, actor.profileId);
      const drive = this.store.driveRoots.find(row.rootId);
      if (
        item === undefined ||
        drive === undefined ||
        !canRead(itemAccess(this.store, actor, drive, item))
      ) {
        return [];
      }
      return [
        {
          kind: row.op === 'create' ? 'added' : 'changed',
          item,
          at: row.at,
          actorProfileId: row.actorProfileId,
          via: row.via,
          deviceId: row.deviceId,
        },
      ];
    });
    return { entries, next: window.next === null ? null : String(window.next) };
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
    const items = window.rows.map((row): DriveActivityEntry => {
      const item = this.store.driveItems.find(row.itemId, actor.profileId);
      return {
        row,
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
    });
    return { items, next: window.next === null ? null : String(window.next) };
  }

  private namedAscending(request: BrowseRequest): boolean {
    return request.sortField === 'name' && request.sortDirection === 'asc';
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
