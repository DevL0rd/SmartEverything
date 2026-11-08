import { DRIVE_ALBUM } from '../drive/album';
import { DRIVE_PLACEMENT } from '../drive/placement';
import { DRIVE_ROOT } from '../drive/root';
import { DRIVE_SYNC_CLIENT } from '../drive/sync-client';
import { DRIVE_CHANGED_NOTICE, DRIVE_PROGRESS_NOTICE } from './endpoints-drive-storage';
import { PHOTOS_PROGRESS_NOTICE } from './endpoints-photos';

export const DRIVE_TABLE_ROWS = {
  drive_roots: DRIVE_ROOT,
  drive_albums: DRIVE_ALBUM,
  drive_sync_clients: DRIVE_SYNC_CLIENT,
  drive_placements: DRIVE_PLACEMENT,
} as const;

export const DRIVE_NOTICES = [
  DRIVE_CHANGED_NOTICE,
  DRIVE_PROGRESS_NOTICE,
  PHOTOS_PROGRESS_NOTICE,
] as const;
