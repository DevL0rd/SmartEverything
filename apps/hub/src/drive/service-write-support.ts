import { ApiError, type DriveVia } from '@smarteverything/domain';
import { messageOf } from '@smarteverything/logging';
import { DriveAlbumKindError } from '../store/repositories/drive-albums';
import type { Store } from '../store/store';
import { DriveAlbumAccessError, DriveAlbumItemError } from './albums';
import type { ChangeActor } from './changes';
import { ConflictError } from './conflicts';
import { DriveWriteError, assertWritable, physicalRoot, type DriveWriteRoot } from './intents';
import { DrivePathError, RootPlacementError } from './paths';
import { DriveFreeSpaceError, DriveQuotaExceededError } from './quotas';
import { RootMarkerError } from './root-marker';
import type { DriveActor, DriveReadService } from './service-read';
import { VolumeError } from './volumes';

export interface DriveCaller extends DriveActor {
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
  | 'driveSyncClients'
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
): DriveWriteRoot {
  const root = physicalRoot(read.rootFor(caller, rootId));
  assertWritable(root);
  return root;
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
  RootPlacementError,
  RootMarkerError,
  VolumeError,
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
