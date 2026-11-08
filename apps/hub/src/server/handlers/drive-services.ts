import type { z } from 'zod';
import type {
  DRIVE_DUPLICATE_GROUP,
  DriveConflict,
  DriveShare,
  DriveVia,
} from '@smarteverything/domain';
import type { DriveAlbumsService } from '../../drive/albums';
import type { DriveBackups } from '../../drive/backups';
import type { DriveHealthReader } from '../../drive/health';
import type { DriveScrubber } from '../../drive/scrub';
import type { DriveViewer } from '../../drive/search';
import type { DriveActor, DriveReadService } from '../../drive/service-read';
import type { DriveWriteService } from '../../drive/service-write';
import type { DriveCaller } from '../../drive/service-write-support';
import type { DriveShares } from '../../drive/shares';
import type { VolumeProbe } from '../../drive/volumes';
import type { Store } from '../../store/store';
import { profileIdOf, roleOfCaller, type Caller } from '../auth';
import type { DriveFiles as DriveByteFiles } from '../drive-files';

export type DriveDuplicateGroup = z.infer<typeof DRIVE_DUPLICATE_GROUP>;

export interface DrivePage<T> {
  readonly items: readonly T[];
  readonly next: string | null;
}

export interface RootPageQuery {
  readonly rootId?: string | undefined;
  readonly cursor?: string | undefined;
}

export interface ShareListQuery {
  readonly itemId?: string | undefined;
  readonly cursor?: string | undefined;
}

export interface DriveListings {
  readonly shares: (actor: DriveActor, query: ShareListQuery) => DrivePage<DriveShare>;
  readonly duplicates: (actor: DriveActor, query: RootPageQuery) => DrivePage<DriveDuplicateGroup>;
  readonly conflicts: (actor: DriveActor, query: RootPageQuery) => DrivePage<DriveConflict>;
}

export interface DriveServices {
  readonly read: DriveReadService;
  readonly write: DriveWriteService;
  readonly albums: DriveAlbumsService;
  readonly shares: DriveShares;
  readonly scrub: Pick<DriveScrubber, 'state'>;
  readonly backups: Pick<DriveBackups, 'status'>;
  readonly health: Pick<DriveHealthReader, 'read'>;
  readonly files: DriveByteFiles;
  readonly probe: VolumeProbe;
  readonly listings: DriveListings;
}

export function actorOf(store: Store, caller: Caller): DriveActor {
  return { profileId: profileIdOf(store, caller), owner: roleOfCaller(caller) === 'owner' };
}

function viaOf(caller: Caller): DriveVia {
  if (caller.kind === 'service') return 'ai';
  if (caller.kind === 'client' && (caller.via !== undefined || caller.mcpOrigin !== undefined)) {
    return 'ai';
  }
  return 'app';
}

export function callerOf(store: Store, caller: Caller): DriveCaller {
  return { ...actorOf(store, caller), via: viaOf(caller), deviceId: null };
}

export function viewerOf(actor: DriveActor): DriveViewer {
  return actor.owner ? { role: 'owner' } : { role: 'member', profileId: actor.profileId };
}
