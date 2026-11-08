import { DriveRecentReader } from '../../../drive/recent';
import { DriveSearch } from '../../../drive/search';
import { DriveStatsReader } from '../../../drive/stats';
import type { StoreContext } from '../../context';
import { DriveAlbumsRepository } from '../drive-albums';
import { DriveBackupsRepository } from '../drive-backups';
import { DriveBlocksRepository } from '../drive-blocks';
import { DriveConflictsRepository } from '../drive-conflicts';
import { DriveDaysRepository } from '../drive-days';
import { DriveFeedRepository } from '../drive-feed';
import { DriveIntentsRepository } from '../drive-intents';
import { DriveItemsRepository } from '../drive-items';
import { DrivePlacementsRepository } from '../drive-placements';
import { DriveQuotasRepository } from '../drive-quotas';
import { DriveRootsRepository } from '../drive-roots';
import { DriveScrubRepository } from '../drive-scrub';
import { DriveSharesRepository } from '../drive-shares';
import { DriveSyncClientsRepository, DriveSyncOpsRepository } from '../drive-sync';
import { DriveTrashRepository } from '../drive-trash';
import { DriveUploadsRepository } from '../drive-uploads';
import { DriveVersionsRepository } from '../drive-versions';

export interface DriveRepositories {
  readonly driveRoots: DriveRootsRepository;
  readonly driveItems: DriveItemsRepository;
  readonly driveAlbums: DriveAlbumsRepository;
  readonly driveTrash: DriveTrashRepository;
  readonly driveDays: DriveDaysRepository;
  readonly driveFeed: DriveFeedRepository;
  readonly driveVersions: DriveVersionsRepository;
  readonly driveShares: DriveSharesRepository;
  readonly driveUploads: DriveUploadsRepository;
  readonly driveQuotas: DriveQuotasRepository;
  readonly driveBackups: DriveBackupsRepository;
  readonly driveScrub: DriveScrubRepository;
  readonly driveIntents: DriveIntentsRepository;
  readonly driveBlocks: DriveBlocksRepository;
  readonly driveConflicts: DriveConflictsRepository;
  readonly drivePlacements: DrivePlacementsRepository;
  readonly driveSyncClients: DriveSyncClientsRepository;
  readonly driveSyncOps: DriveSyncOpsRepository;
  readonly driveSearch: DriveSearch;
  readonly driveRecent: DriveRecentReader;
  readonly driveStats: DriveStatsReader;
}

export function driveRepositories(context: StoreContext): DriveRepositories {
  return {
    driveRoots: new DriveRootsRepository(context),
    driveItems: new DriveItemsRepository(context),
    driveAlbums: new DriveAlbumsRepository(context),
    driveTrash: new DriveTrashRepository(context),
    driveDays: new DriveDaysRepository(context),
    driveFeed: new DriveFeedRepository(context),
    driveVersions: new DriveVersionsRepository(context),
    driveShares: new DriveSharesRepository(context),
    driveUploads: new DriveUploadsRepository(context),
    driveQuotas: new DriveQuotasRepository(context),
    driveBackups: new DriveBackupsRepository(context),
    driveScrub: new DriveScrubRepository(context),
    driveIntents: new DriveIntentsRepository(context),
    driveBlocks: new DriveBlocksRepository(context),
    driveConflicts: new DriveConflictsRepository(context),
    drivePlacements: new DrivePlacementsRepository(context),
    driveSyncClients: new DriveSyncClientsRepository(context),
    driveSyncOps: new DriveSyncOpsRepository(context),
    driveSearch: new DriveSearch(context),
    driveRecent: new DriveRecentReader(context),
    driveStats: new DriveStatsReader(context),
  };
}
