import { DRIVE_ACCESS_REQUEST } from '../drive/access-request';
import { DRIVE_ALBUM } from '../drive/album';
import { DRIVE_FILE_REQUEST } from '../drive/file-request';
import { DRIVE_GRANT } from '../drive/grant';
import { DRIVE_NOTIFICATION } from '../drive/notification';
import { DRIVE_OFFLINE_ITEM } from '../drive/offline';
import { DRIVE_PLACEMENT } from '../drive/placement';
import { DRIVE_ROOT } from '../drive/root';
import { DRIVE_TRANSFER } from '../drive/transfer';
import { PHOTOS_EDIT_JOB_NOTICE } from '../photos/edits';
import { PHOTOS_FOLDERS_NOTICE } from '../photos/folders';
import { PHOTOS_ACTIVITY_NOTICE, PHOTOS_PARTNER_NOTICE } from '../photos/sharing';
import { PHOTOS_AI_NOTICE } from '../photos/smart';
import { DRIVE_COMMENTS_CHANGED_NOTICE, DRIVE_NOTIFICATION_NOTICE } from './endpoints-drive-social';
import { DRIVE_CHANGED_NOTICE, DRIVE_PROGRESS_NOTICE } from './endpoints-drive-storage';
import { PHOTOS_PROGRESS_NOTICE } from './endpoints-photos';

export const DRIVE_TABLE_ROWS = {
  drive_roots: DRIVE_ROOT,
  drive_albums: DRIVE_ALBUM,
  drive_grants: DRIVE_GRANT,
  drive_placements: DRIVE_PLACEMENT,
  drive_notifications: DRIVE_NOTIFICATION,
  drive_access_requests: DRIVE_ACCESS_REQUEST,
  drive_file_requests: DRIVE_FILE_REQUEST,
  drive_transfers: DRIVE_TRANSFER,
  drive_offline_items: DRIVE_OFFLINE_ITEM,
} as const;

export const DRIVE_NOTICES = [
  DRIVE_CHANGED_NOTICE,
  DRIVE_PROGRESS_NOTICE,
  DRIVE_COMMENTS_CHANGED_NOTICE,
  DRIVE_NOTIFICATION_NOTICE,
  PHOTOS_PROGRESS_NOTICE,
  PHOTOS_ACTIVITY_NOTICE,
  PHOTOS_PARTNER_NOTICE,
  PHOTOS_AI_NOTICE,
  PHOTOS_FOLDERS_NOTICE,
  PHOTOS_EDIT_JOB_NOTICE,
] as const;
