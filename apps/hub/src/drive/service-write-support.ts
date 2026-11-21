import { ApiError, type DriveItem, type DriveVia } from '@smarteverything/domain';
import { messageOf } from '@smarteverything/logging';
import { DriveAlbumKindError } from '../store/repositories/drive-albums';
import { StoreConflictError } from '../store/sql';
import type { Store } from '../store/store';
import { DriveAlbumAccessError, DriveAlbumItemError } from './albums';
import type { ChangeActor } from './changes';
import { ConflictError } from './conflict-error';
import { DriveWriteError } from './write-error';
import { DrivePathError } from './paths';
import { DataSpaceError } from './data-space';
import { DriveFreeSpaceError, DriveQuotaExceededError } from './quotas';
import { RootMarkerError } from './root-marker';
import type { StoredDrive } from '../store/repositories/drive-roots';
import { canWrite, driveAccess, type DriveActor } from './access';
import type { DriveReadService } from './service-read';

export interface DriveCaller extends DriveActor {
  readonly owner: boolean;
  readonly via: DriveVia;
  readonly deviceId: string | null;
}

export type WriteStore = Pick<Store, 'feed' | 'now' | 'host'>;

export function changeActorOf(caller: DriveCaller): ChangeActor {
  return { actorProfileId: caller.profileId, via: caller.via, deviceId: caller.deviceId };
}

export function requireOwner(caller: DriveCaller): void {
  if (!caller.owner) {
    throw new ApiError('forbidden', 'Only the owner can do this.');
  }
}

export async function writableRoot(
  read: DriveReadService,
  caller: DriveCaller,
  rootId: string,
): Promise<StoredDrive> {
  const drive = await read.rootFor(caller, rootId);
  if (!canWrite(driveAccess(caller, drive))) {
    throw new ApiError('forbidden', 'You cannot change files in this drive.');
  }
  return drive;
}

export function writableItemRoot(
  store: Pick<Store, 'host'>,
  caller: DriveActor,
  item: DriveItem,
): Promise<StoredDrive> {
  return store.host.read('driveWritableItemRoot', { actor: caller, item });
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
  StoreConflictError,
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
