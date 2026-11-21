import {
  DRIVE_HASH_HEALTH_UNIT,
  DRIVE_HASH_RECORD_UNIT,
  DRIVE_HASH_START_UNIT,
  HASH_BACKLOG_UNIT,
} from '../../drive/units/hash';
import {
  DRIVE_CONTENT_PLACE_UNIT,
  DRIVE_RECORD_ITEM_UNIT,
  DRIVE_SETTLE_BATCH_UNIT,
  DRIVE_SETTLE_CONTENT_UNIT,
} from '../../drive/units/content';
import {
  DRIVE_CHANGED_ELSEWHERE_UNIT,
  DRIVE_MOUNT_PATH_UNIT,
  DRIVE_MOUNT_PUSH_WINDOW_UNIT,
  DRIVE_MOUNT_SPOT_UNIT,
} from '../../drive/units/mount';
import {
  DRIVE_METADATA_PENDING_UNIT,
  DRIVE_METADATA_RECORD_UNIT,
} from '../../drive/units/metadata';
import { DRIVE_OPS_UNIT } from '../../drive/units/ops';
import {
  DRIVE_PLACEMENT_CHANGE_UNIT,
  DRIVE_PLACEMENT_LIST_UNIT,
} from '../../drive/units/placements';
import { DRIVE_PLACEMENT_RECONCILE_UNIT } from '../../drive/units/placement-reconcile';
import {
  DRIVE_POSIX_CHILD_UNIT,
  DRIVE_POSIX_DIRECTORY_UNIT,
  DRIVE_POSIX_NODE_UNIT,
} from '../../drive/units/posix';
import { DRIVE_FINISH_COMMIT_UNIT } from '../../drive/units/recovery';
import {
  DRIVE_SCRUB_HEALTH_UNIT,
  DRIVE_SCRUB_OVERVIEW_UNIT,
  DRIVE_SCRUB_RECORD_UNIT,
  DRIVE_SCRUB_WINDOW_UNIT,
} from '../../drive/units/scrub';
import {
  DRIVE_SCAN_APPLY_UNIT,
  DRIVE_SCAN_BEGIN_UNIT,
  DRIVE_SCAN_END_UNIT,
  DRIVE_SCAN_INDEXED_UNIT,
  DRIVE_SCAN_PLACE_UNIT,
  DRIVE_SCAN_SETTLE_UNIT,
  DRIVE_SCAN_SWEEP_UNIT,
} from '../../drive/units/scan';
import {
  DRIVE_TEXT_BACKLOG_UNIT,
  DRIVE_TEXT_FOLDERS_UNIT,
  DRIVE_TEXT_RECORD_UNIT,
} from '../../drive/units/text';
import { DRIVE_UPLOAD_DESTINATION_UNIT } from '../../drive/units/upload';
import { DRIVE_SYNC_CHANGES_UNIT, DRIVE_SYNC_INDEX_PAGE_UNIT } from '../../drive/units/sync';

export const DRIVE_READ_UNITS = {
  hashBacklog: HASH_BACKLOG_UNIT,
  driveHashStart: DRIVE_HASH_START_UNIT,
  driveContentPlace: DRIVE_CONTENT_PLACE_UNIT,
  driveUploadDestination: DRIVE_UPLOAD_DESTINATION_UNIT,
  driveSyncChanges: DRIVE_SYNC_CHANGES_UNIT,
  driveSyncIndexPage: DRIVE_SYNC_INDEX_PAGE_UNIT,
  drivePosixNode: DRIVE_POSIX_NODE_UNIT,
  drivePosixChild: DRIVE_POSIX_CHILD_UNIT,
  drivePosixDirectory: DRIVE_POSIX_DIRECTORY_UNIT,
  driveChangedElsewhere: DRIVE_CHANGED_ELSEWHERE_UNIT,
  driveMountPath: DRIVE_MOUNT_PATH_UNIT,
  driveMountPushWindow: DRIVE_MOUNT_PUSH_WINDOW_UNIT,
  driveMountSpot: DRIVE_MOUNT_SPOT_UNIT,
  drivePlacementList: DRIVE_PLACEMENT_LIST_UNIT,
  driveScrubWindow: DRIVE_SCRUB_WINDOW_UNIT,
  driveScrubOverview: DRIVE_SCRUB_OVERVIEW_UNIT,
  driveScanIndexed: DRIVE_SCAN_INDEXED_UNIT,
  driveMetadataPending: DRIVE_METADATA_PENDING_UNIT,
  driveTextBacklog: DRIVE_TEXT_BACKLOG_UNIT,
  driveTextFolders: DRIVE_TEXT_FOLDERS_UNIT,
} as const;

export const DRIVE_WRITE_UNITS = {
  driveHashRecord: DRIVE_HASH_RECORD_UNIT,
  driveHashHealth: DRIVE_HASH_HEALTH_UNIT,
  driveSettleContent: DRIVE_SETTLE_CONTENT_UNIT,
  driveSettleBatch: DRIVE_SETTLE_BATCH_UNIT,
  driveRecordItem: DRIVE_RECORD_ITEM_UNIT,
  driveOps: DRIVE_OPS_UNIT,
  driveFinishCommit: DRIVE_FINISH_COMMIT_UNIT,
  drivePlacementChange: DRIVE_PLACEMENT_CHANGE_UNIT,
  drivePlacementReconcile: DRIVE_PLACEMENT_RECONCILE_UNIT,
  driveScrubRecord: DRIVE_SCRUB_RECORD_UNIT,
  driveScrubHealth: DRIVE_SCRUB_HEALTH_UNIT,
  driveScanBegin: DRIVE_SCAN_BEGIN_UNIT,
  driveScanApply: DRIVE_SCAN_APPLY_UNIT,
  driveScanSettle: DRIVE_SCAN_SETTLE_UNIT,
  driveScanPlace: DRIVE_SCAN_PLACE_UNIT,
  driveScanSweep: DRIVE_SCAN_SWEEP_UNIT,
  driveScanEnd: DRIVE_SCAN_END_UNIT,
  driveMetadataRecord: DRIVE_METADATA_RECORD_UNIT,
  driveTextRecord: DRIVE_TEXT_RECORD_UNIT,
} as const;
