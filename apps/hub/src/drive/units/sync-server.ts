import { dirname } from 'node:path';
import {
  ApiError,
  DRIVE_PLACEMENT_STATUS,
  type DriveItem,
  type DrivePlacementStatus,
} from '@smarteverything/domain';
import { checkSyncPath, collidesWith } from '@smarteverything/domain/drive-sync';
import type { DriveBlocks } from '../../store/repositories/drive-blocks';
import type { DriveInode } from '../../store/repositories/drive-inodes';
import type { StoredDrive } from '../../store/repositories/drive-roots';
import { storeUnit } from '../../store/host/unit';
import type { HostStore } from '../../store/host/host-store';
import { canRead, itemAccess, type DriveActor } from '../access';
import type { ChangeActor } from '../changes';
import { DRIVE_PAGE_SIZE } from '../page-size';
import { requireExport } from '../sharing/export-guard';
import { fileOf, type ContentItem } from '../sync/file-of';
import { inodeOfItem } from '../sync/item-meta';
import type { SyncScope } from '../sync/placement-scope';
import type { ConflictReason } from '../sync/server-ops';
import { inScope, toDrivePath } from '../sync/sync-paths';
import { DriveWriteError } from '../write-error';
import { announce, appendFeed } from './change-feed';

const PORTABLE_OS = /windows|mac|darwin/iu;

type PathStore = Pick<HostStore, 'drivePlacements' | 'devices' | 'driveItems'>;

function portableRoot(store: PathStore, rootId: string): boolean {
  return store.drivePlacements
    .forRoot(rootId)
    .filter((placement) => placement.mode === 'synced' && placement.enabled)
    .some((placement) => {
      const os = store.devices.find(placement.deviceId)?.details['os'];
      return typeof os === 'string' && PORTABLE_OS.test(os);
    });
}

function* namesIn(store: PathStore, rootId: string, parent: DriveItem | null): Generator<string> {
  let after: string | null = null;
  do {
    const window = store.driveItems.children({
      rootId,
      parentId: parent?.id ?? null,
      after,
      limit: DRIVE_PAGE_SIZE,
      viewer: null,
    });
    for (const { item } of window.entries) yield item.name;
    after = window.next;
  } while (after !== null);
}

function ancestryReason(
  store: PathStore,
  rootId: string,
  relPath: string,
  portable: boolean,
): ConflictReason | null {
  const segments = relPath.split('/');
  let parent: DriveItem | null = null;
  let prefix = '';
  for (const [at, segment] of segments.entries()) {
    if (portable && collidesWith(segment, namesIn(store, rootId, parent)) !== null) return 'path';
    prefix = prefix === '' ? segment : `${prefix}/${segment}`;
    const next = store.driveItems.byPath(rootId, prefix, null);
    if (next === undefined) return null;
    if (at < segments.length - 1 && next.kind !== 'folder') return 'exists';
    parent = next;
  }
  return null;
}

export interface SyncPathInput {
  readonly scope: SyncScope;
  readonly wirePath: string;
}

export const DRIVE_SYNC_PATH_REASON_UNIT = storeUnit(
  (store, { scope, wirePath }: SyncPathInput): ConflictReason | null => {
    const rootId = scope.drive.id;
    const portable = portableRoot(store, rootId);
    const drivePath = toDrivePath(scope, wirePath);
    if (!inScope(scope, drivePath) || !checkSyncPath(wirePath, { portable }).ok) return 'path';
    return ancestryReason(store, rootId, drivePath, portable);
  },
);

export interface SyncInodeInput {
  readonly rootId: string;
  readonly itemId: string | null;
}

export const DRIVE_SYNC_INODE_UNIT = storeUnit((store, input: SyncInodeInput): DriveInode =>
  input.itemId === null
    ? store.driveInodes.rootOf(input.rootId)
    : inodeOfItem(store, { id: input.itemId }),
);

export interface SyncParentInput {
  readonly rootId: string;
  readonly drivePath: string;
}

export const DRIVE_SYNC_PARENT_INODE_UNIT = storeUnit((store, input: SyncParentInput): number => {
  const folder = dirname(input.drivePath);
  if (folder === '.') return store.driveInodes.rootOf(input.rootId).id;
  const parent = store.driveItems.byPath(input.rootId, folder, null);
  if (parent?.kind !== 'folder') {
    throw new DriveWriteError('missing', 'The folder is not in the index.');
  }
  return inodeOfItem(store, parent).id;
});

function announceItem(store: HostStore, itemId: string, actor: ChangeActor): void {
  const current = store.driveItems.byId(itemId, null);
  appendFeed({ store }, current, 'update', actor);
  announce({ store }, current.rootId, current.parentId, [current]);
}

export interface SyncAnnounceInput {
  readonly itemId: string;
  readonly actor: ChangeActor;
}

export const DRIVE_SYNC_ANNOUNCE_UNIT = storeUnit((store, input: SyncAnnounceInput) => {
  store.write(() => {
    announceItem(store, input.itemId, input.actor);
  });
});

export interface SyncLinkBlocksInput {
  readonly blocks: DriveBlocks;
  readonly actor: ChangeActor;
}

export const DRIVE_SYNC_LINK_BLOCKS_UNIT = storeUnit((store, input: SyncLinkBlocksInput) => {
  store.write(() => {
    store.driveBlocks.put(input.blocks);
    announceItem(store, input.blocks.itemId, input.actor);
  });
});

function* filesUnder(store: HostStore, item: DriveItem): Generator<DriveItem> {
  if (item.kind !== 'folder') {
    yield item;
    return;
  }
  let after: string | null = null;
  do {
    const window = store.driveItems.children({
      rootId: item.rootId,
      parentId: item.id,
      after,
      limit: DRIVE_PAGE_SIZE,
      viewer: null,
    });
    for (const { item: child } of window.entries) yield* filesUnder(store, child);
    after = window.next;
  } while (after !== null);
}

export const DRIVE_SYNC_CARRIED_BLOCKS_UNIT = storeUnit((store, item: DriveItem): DriveBlocks[] =>
  [...filesUnder(store, item)].flatMap((file) => {
    if (file.kind === 'link' || file.kind === 'special') return [];
    const blocks = store.driveBlocks.find(file.id, file.rev);
    return blocks === undefined ? [] : [blocks];
  }),
);

export interface SyncBlockTargetInput {
  readonly actor: DriveActor;
  readonly rootId: string | null;
  readonly itemId: string | null;
}

export interface SyncBlockTarget {
  readonly root: StoredDrive;
  readonly item: ContentItem;
}

export const DRIVE_SYNC_BLOCK_TARGET_UNIT = storeUnit(
  (store, input: SyncBlockTargetInput): SyncBlockTarget => {
    const drive = input.rootId === null ? undefined : store.driveRoots.find(input.rootId);
    const found = input.itemId === null ? undefined : store.driveItems.find(input.itemId, null);
    if (drive === undefined || found?.rootId !== drive.id) {
      throw new ApiError('not_found', 'There is no such file for this person.');
    }
    const access = itemAccess(store, input.actor, drive, found);
    if (!canRead(access)) {
      throw new ApiError('not_found', 'There is no such file for this person.');
    }
    requireExport(access, found);
    const item = fileOf(found);
    if (item === null) throw new ApiError('invalid_request', 'A folder has no blocks.');
    return { root: drive, item };
  },
);

export interface SyncReportInput {
  readonly placementId: string;
  readonly need: number;
  readonly errors: DrivePlacementStatus['errors'];
}

export const DRIVE_SYNC_REPORT_UNIT = storeUnit((store, input: SyncReportInput) => {
  store.write(() => {
    const { status } = store.drivePlacements.byId(input.placementId);
    const settled = input.need === 0 && input.errors.length === 0;
    const lastSyncedAt =
      settled && (status.needBytes !== 0 || status.lastSyncedAt === null)
        ? store.now().toISOString()
        : status.lastSyncedAt;
    const next: DrivePlacementStatus = DRIVE_PLACEMENT_STATUS.parse({
      ...status,
      needBytes: input.need,
      errors: input.errors,
      lastSyncedAt,
    });
    if (JSON.stringify(next) === JSON.stringify(status)) return;
    store.drivePlacements.writeStatus(input.placementId, next);
  });
});
