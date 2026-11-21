import { DriveRecentReader } from '../../../drive/recent';
import { DriveSearch } from '../../../drive/search';
import { DriveStatsReader } from '../../../drive/stats';
import type { StoreContext } from '../../context';
import { DriveAccessRequestsRepository } from '../drive-access-requests';
import { DriveCommentsRepository } from '../drive-comments';
import { DriveFileRequestsRepository } from '../drive-file-requests';
import { DriveFolderColoursRepository } from '../drive-folder-colours';
import { DriveFolderIconsRepository } from '../drive-folder-icons';
import { DriveItemTextRepository } from '../drive-item-text';
import { DriveLocksRepository } from '../drive-locks';
import { DriveNotificationsRepository } from '../drive-notifications';
import { DriveOfflineRepository } from '../drive-offline';
import { DriveOpensRepository } from '../drive-opens';
import { DriveShortcutsRepository } from '../drive-shortcuts';
import { DriveTransfersRepository } from '../drive-transfers';
import { DriveAlbumsRepository } from '../drive-albums';
import { DriveBackupsRepository } from '../drive-backups';
import { DriveBlocksRepository } from '../drive-blocks';
import { DriveConflictsRepository } from '../drive-conflicts';
import { DriveDaysRepository } from '../drive-days';
import { DriveFeedRepository } from '../drive-feed';
import { DriveIntentsRepository } from '../drive-intents';
import { DriveInodesRepository } from '../drive-inodes';
import { DriveItemsRepository } from '../drive-items';
import { DriveMountCommitsRepository } from '../drive-mount-commits';
import { DriveInodeLeasesRepository } from '../drive-inode-leases';
import { DriveXattrsRepository } from '../drive-xattrs';
import { DrivePlacementsRepository } from '../drive-placements';
import { DriveQuotasRepository } from '../drive-quotas';
import { DriveGrantsRepository } from '../drive-grants';
import type { DriveFolders } from '../../../data-layout/drive-folders';
import { DriveRootsRepository } from '../drive-roots';
import { DriveStarsRepository } from '../drive-stars';
import { DriveScrubRepository } from '../drive-scrub';
import { DriveSharesRepository } from '../drive-shares';
import { DriveSyncOpsRepository } from '../drive-sync';
import { DriveTrashRepository } from '../drive-trash';
import { DriveMissingRepository } from '../drive-missing';
import { DriveUploadsRepository } from '../drive-uploads';
import { DriveVersionsRepository } from '../drive-versions';

export interface DriveRepositories {
  readonly driveRoots: DriveRootsRepository;
  readonly driveItems: DriveItemsRepository;
  readonly driveInodes: DriveInodesRepository;
  readonly driveXattrs: DriveXattrsRepository;
  readonly driveMountCommits: DriveMountCommitsRepository;
  readonly driveInodeLeases: DriveInodeLeasesRepository;
  readonly driveAlbums: DriveAlbumsRepository;
  readonly driveTrash: DriveTrashRepository;
  readonly driveMissing: DriveMissingRepository;
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
  readonly driveGrants: DriveGrantsRepository;
  readonly driveStars: DriveStarsRepository;
  readonly driveSyncOps: DriveSyncOpsRepository;
  readonly driveAccessRequests: DriveAccessRequestsRepository;
  readonly driveComments: DriveCommentsRepository;
  readonly driveFileRequests: DriveFileRequestsRepository;
  readonly driveFolderColours: DriveFolderColoursRepository;
  readonly driveFolderIcons: DriveFolderIconsRepository;
  readonly driveItemText: DriveItemTextRepository;
  readonly driveLocks: DriveLocksRepository;
  readonly driveNotifications: DriveNotificationsRepository;
  readonly driveOffline: DriveOfflineRepository;
  readonly driveOpens: DriveOpensRepository;
  readonly driveShortcuts: DriveShortcutsRepository;
  readonly driveTransfers: DriveTransfersRepository;
  readonly driveSearch: DriveSearch;
  readonly driveRecent: DriveRecentReader;
  readonly driveStats: DriveStatsReader;
}

export function driveRepositories(
  context: StoreContext,
  driveFolders: DriveFolders | null,
): DriveRepositories {
  return {
    driveRoots: new DriveRootsRepository(context, driveFolders),
    driveItems: new DriveItemsRepository(context),
    driveInodes: new DriveInodesRepository(context),
    driveXattrs: new DriveXattrsRepository(context),
    driveMountCommits: new DriveMountCommitsRepository(context),
    driveInodeLeases: new DriveInodeLeasesRepository(context),
    driveAlbums: new DriveAlbumsRepository(context),
    driveTrash: new DriveTrashRepository(context),
    driveMissing: new DriveMissingRepository(context),
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
    driveGrants: new DriveGrantsRepository(context),
    driveStars: new DriveStarsRepository(context),
    driveSyncOps: new DriveSyncOpsRepository(context),
    driveAccessRequests: new DriveAccessRequestsRepository(context),
    driveComments: new DriveCommentsRepository(context),
    driveFileRequests: new DriveFileRequestsRepository(context),
    driveFolderColours: new DriveFolderColoursRepository(context),
    driveFolderIcons: new DriveFolderIconsRepository(context),
    driveItemText: new DriveItemTextRepository(context),
    driveLocks: new DriveLocksRepository(context),
    driveNotifications: new DriveNotificationsRepository(context),
    driveOffline: new DriveOfflineRepository(context),
    driveOpens: new DriveOpensRepository(context),
    driveShortcuts: new DriveShortcutsRepository(context),
    driveTransfers: new DriveTransfersRepository(context),
    driveSearch: new DriveSearch(context),
    driveRecent: new DriveRecentReader(context),
    driveStats: new DriveStatsReader(context),
  };
}
