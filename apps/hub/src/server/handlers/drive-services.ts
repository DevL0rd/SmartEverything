import type { z } from 'zod';
import type {
  DRIVE_DUPLICATE_GROUP,
  DriveDataSpace,
  DriveConflict,
  DriveShare,
  DriveVia,
} from '@smarteverything/domain';
import type { DriveAlbumsService } from '../../drive/albums';
import type { DriveBackups } from '../../drive/backups';
import type { DriveHealthReader } from '../../drive/health';
import type { DriveScrubber } from '../../drive/scrub';
import type { DriveActor } from '../../drive/access';
import type { DriveUsageViewer } from '../../drive/usage';
import type { DriveReadService } from '../../drive/service-read';
import type { DriveWriteService } from '../../drive/service-write';
import type { DriveCaller } from '../../drive/service-write-support';
import type { DriveShares } from '../../drive/shares';
import type { DriveGrants } from '../../drive/grants';
import type { DataSpaceProbe } from '../../drive/data-space';
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
  readonly grants: DriveGrants;
  readonly probe: DataSpaceProbe;
  readonly dataSpace: () => Promise<DriveDataSpace>;
  readonly listings: DriveListings;
}

export function actorOf(store: Store, caller: Caller): DriveActor {
  return { profileId: profileIdOf(store, caller) };
}

function viaOf(caller: Caller): DriveVia {
  if (caller.kind === 'service') return 'ai';
  if (caller.kind === 'client' && (caller.via !== undefined || caller.mcpOrigin !== undefined)) {
    return 'ai';
  }
  return 'app';
}

export function callerOf(store: Store, caller: Caller): DriveCaller {
  return {
    ...actorOf(store, caller),
    owner: roleOfCaller(caller) === 'owner',
    via: viaOf(caller),
    deviceId: null,
  };
}

export function usageViewerOf(store: Store, caller: Caller): DriveUsageViewer {
  return roleOfCaller(caller) === 'owner'
    ? { role: 'owner' }
    : { role: 'member', profileId: profileIdOf(store, caller) };
}
