import type {
  DriveActivityEntry,
  DriveAlbum,
  DriveAlbumSurface,
  DriveItem,
  DriveRecentFilter,
  DriveRecentPage,
  DriveRoot,
  DriveShortcut,
  DriveSort,
  DriveVersion,
} from '@smarteverything/domain';
import type { Store } from '../store/store';
import type { StoredDrive } from '../store/repositories/drive-roots';
import type { DriveActor } from './access';

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

export interface ItemPageRequest {
  readonly itemId: string;
  readonly cursor: string | undefined;
}

export interface VersionPage {
  readonly items: readonly DriveVersion[];
  readonly next: string | null;
}

export interface ActivityPage {
  readonly items: readonly DriveActivityEntry[];
  readonly next: string | null;
}

export interface ItemAndRoot {
  readonly item: DriveItem;
  readonly root: StoredDrive;
}

export class DriveReadService {
  constructor(private readonly store: Pick<Store, 'host'>) {}

  listRoots(actor: DriveActor): Promise<DriveRoot[]> {
    return this.store.host.read('driveListRoots', { actor });
  }

  rootFor(actor: DriveActor, rootId: string): Promise<StoredDrive> {
    return this.store.host.read('driveRootFor', { actor, rootId });
  }

  rootOfItem(actor: DriveActor, item: DriveItem): Promise<StoredDrive> {
    return this.store.host.read('driveRootOfItem', { actor, item });
  }

  readItem(actor: DriveActor, itemId: string): Promise<DriveItem> {
    return this.store.host.read('driveReadItem', { actor, itemId });
  }

  readItemAndRoot(actor: DriveActor, itemId: string): Promise<ItemAndRoot> {
    return this.store.host.read('driveReadItemRoot', { actor, itemId });
  }

  recordOpen(actor: DriveActor, itemId: string, at: string): Promise<void> {
    return this.store.host.write('driveRecordOpen', { actor, itemId, at });
  }

  browseFolder(actor: DriveActor, request: BrowseRequest): Promise<BrowsePage> {
    return this.store.host.read('driveBrowseFolder', { actor, request });
  }

  listAlbums(actor: DriveActor, surface: DriveAlbumSurface): Promise<DriveAlbum[]> {
    return this.store.host.read('driveListAlbums', { actor, surface });
  }

  readRecent(actor: DriveActor, request: RecentRequest): Promise<DriveRecentPage> {
    return this.store.host.read('driveReadRecent', { actor, request });
  }

  readActivity(
    actor: DriveActor,
    request: { readonly from: string; readonly cursor?: string | undefined },
  ): Promise<ActivityPage> {
    return this.store.host.read('driveReadActivity', { actor, request });
  }

  itemVersions(actor: DriveActor, request: ItemPageRequest): Promise<VersionPage> {
    return this.store.host.read('driveItemVersions', { actor, request });
  }

  itemActivity(actor: DriveActor, request: ItemPageRequest): Promise<ActivityPage> {
    return this.store.host.read('driveItemActivity', { actor, request });
  }
}
