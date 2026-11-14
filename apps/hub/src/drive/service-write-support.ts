import { ApiError, type DriveItem, type DriveVia } from '@smarteverything/domain';
import { messageOf } from '@smarteverything/logging';
import { DriveAlbumKindError } from '../store/repositories/drive-albums';
import type { Store } from '../store/store';
import { DriveAlbumAccessError, DriveAlbumItemError } from './albums';
import type { ChangeActor } from './changes';
import { ConflictError } from './conflicts';
import { DriveWriteError } from './intents';
import { DrivePathError } from './paths';
import { DataSpaceError } from './data-space';
import { DriveFreeSpaceError, DriveQuotaExceededError } from './quotas';
import { RootMarkerError } from './root-marker';
import type { StoredDrive } from '../store/repositories/drive-roots';
import { canWrite, driveAccess, itemAccess, type DriveActor } from './access';
import type { DriveReadService } from './service-read';

export interface DriveCaller extends DriveActor {
  readonly owner: boolean;
  readonly via: DriveVia;
  readonly deviceId: string | null;
}

export type WriteStore = Pick<
  Store,
  | 'driveRoots'
  | 'driveItems'
  | 'driveAlbums'
  | 'driveFeed'
  | 'driveTrash'
  | 'driveVersions'
  | 'driveIntents'
  | 'driveQuotas'
  | 'driveStars'
  | 'driveGrants'
  | 'feed'
  | 'settingsKv'
  | 'write'
  | 'now'
>;

export function changeActorOf(caller: DriveCaller): ChangeActor {
  return { actorProfileId: caller.profileId, via: caller.via, deviceId: caller.deviceId };
}

export function requireOwner(caller: DriveCaller): void {
  if (!caller.owner) {
    throw new ApiError('forbidden', 'Only the owner can do this.');
  }
}

export function writableRoot(
  read: DriveReadService,
  caller: DriveCaller,
  rootId: string,
): StoredDrive {
  const drive = read.rootFor(caller, rootId);
  if (!canWrite(driveAccess(caller, drive))) {
    throw new ApiError('forbidden', 'You cannot change files in this drive.');
  }
  return drive;
}

export function writableItemRoot(
  store: Pick<Store, 'driveRoots' | 'driveItems' | 'driveGrants'>,
  caller: DriveCaller,
  item: DriveItem,
): StoredDrive {
  const drive = store.driveRoots.byId(item.rootId);
  const access = itemAccess(store, caller, drive, item);
  if (access === 'none') {
    throw new ApiError('not_found', 'There is no such file or folder.');
  }
  if (!canWrite(access)) {
    throw new ApiError('forbidden', 'You can only view this; you cannot change it.');
  }
  return drive;
}

const REFUSALS = [
  ApiError,
  DriveWriteError,
  DrivePathError,
  DriveQuotaExceededError,
  DriveFreeSpaceError,
  ConflictError,
  DriveAlbumAccessError,
  DriveAlbumItemError,
  DriveAlbumKindError,
  RootMarkerError,
  DataSpaceError,
] as const;

export function refusalReason(cause: unknown): string | null {
  return REFUSALS.some((refusal) => cause instanceof refusal) ? messageOf(cause) : null;
}

export class NameClash extends Error {
  override readonly name = 'NameClash';

  constructor(
    readonly itemName: string,
    readonly existingItemId: string,
  ) {
    super(`${itemName} already exists in that folder.`);
  }
}
