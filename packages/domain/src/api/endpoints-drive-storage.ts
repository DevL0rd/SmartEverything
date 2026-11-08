import { z } from 'zod';
import {
  DRIVE_BACKUP_REPORT,
  DRIVE_BACKUP_REPORT_INPUT,
  DRIVE_BACKUP_STATUS,
  DRIVE_HEALTH,
  DRIVE_SCRUB_STATE,
} from '../drive/health';
import { DRIVE_ACTIVITY_ENTRY } from '../drive/activity';
import { DRIVE_FEED_ROW } from '../drive/feed';
import { DRIVE_CONFLICT, DRIVE_CONFLICT_RESOLVE } from '../drive/conflict';
import { DRIVE_QUOTA, DRIVE_QUOTA_SET } from '../drive/quota';
import { DRIVE_SETTINGS, DRIVE_SETTINGS_UPDATE } from '../drive/settings';
import { DRIVE_SHARE, DRIVE_SHARE_CREATE, DRIVE_SHARE_CREATED } from '../drive/share';
import { DRIVE_SYNC_CLIENT, DRIVE_SYNC_CLIENT_UPDATE } from '../drive/sync-client';
import { DRIVE_USAGE } from '../drive/usage';
import { DRIVE_VERSION } from '../drive/version';
import { DRIVE_ITEM } from '../drive/item';
import { MONTH } from '../photos/shared';
import { NO_BODY, endpoint } from './endpoint';
import {
  CURSOR_QUERY,
  DRIVE_CURSOR,
  DRIVE_ITEM_PARAMS,
  DRIVE_ROOT_PAGE_QUERY,
  pageOf,
} from './endpoints-drive';
import { MEDIA_LINK } from './endpoints-media';
import { COUNT, DONE, ID, NOTHING } from './primitives';

export const DRIVE_SHARE_TOKEN = z.string().min(1);

export const DRIVE_SHARE_UNLOCK = z.strictObject({ password: z.string().min(1) }).readonly();

export type DriveShareUnlock = z.infer<typeof DRIVE_SHARE_UNLOCK>;

export const DRIVE_CHANGED_NOTICE = z.strictObject({
  type: z.literal('drive_changed'),
  rootIds: z.array(ID).readonly(),
  folderIds: z.array(ID).readonly(),
  albumIds: z.array(ID).readonly(),
  months: z.array(MONTH).readonly(),
  cursor: COUNT,
});

export type DriveChangedNotice = z.infer<typeof DRIVE_CHANGED_NOTICE>;

export const DRIVE_PROGRESS_PHASES = ['scan', 'hash', 'scrub'] as const;

export const DRIVE_PROGRESS_NOTICE = z
  .strictObject({
    type: z.literal('drive_progress'),
    rootId: ID,
    phase: z.enum(DRIVE_PROGRESS_PHASES),
    done: COUNT,
    total: COUNT,
  })
  .refine((progress) => progress.done <= progress.total, {
    message: 'done cannot pass total',
    path: ['done'],
  });

export type DriveProgressNotice = z.infer<typeof DRIVE_PROGRESS_NOTICE>;

const SHARE_PARAMS = z.strictObject({ shareId: ID });

export const DRIVE_STORAGE_ENDPOINTS = {
  listVersions: endpoint({
    method: 'GET',
    path: '/api/drive/items/:itemId/versions',
    access: 'member',
    summary: 'The earlier versions the hub kept of a file, newest first',
    params: DRIVE_ITEM_PARAMS,
    query: CURSOR_QUERY,
    body: NO_BODY,
    response: pageOf(DRIVE_VERSION),
  }),
  listDriveActivity: endpoint({
    method: 'GET',
    path: '/api/drive/activity',
    access: 'member',
    summary: 'The changes to visible library folders since a date, newest first',
    params: NOTHING,
    query: z.strictObject({
      from: z.iso.datetime({ offset: true }),
      cursor: DRIVE_CURSOR.optional(),
    }),
    body: NO_BODY,
    response: pageOf(DRIVE_ACTIVITY_ENTRY),
  }),
  listItemActivity: endpoint({
    method: 'GET',
    path: '/api/drive/items/:itemId/activity',
    access: 'member',
    summary: 'The changes recorded for one file or folder, newest first',
    params: DRIVE_ITEM_PARAMS,
    query: CURSOR_QUERY,
    body: NO_BODY,
    response: pageOf(DRIVE_FEED_ROW),
  }),
  restoreVersion: endpoint({
    method: 'POST',
    path: '/api/drive/items/:itemId/versions/:versionId/restore',
    access: 'member',
    summary: 'Bring back an earlier version of a file; the current one is kept as a version',
    params: z.strictObject({ itemId: ID, versionId: ID }),
    query: NOTHING,
    body: NO_BODY,
    response: DRIVE_ITEM,
  }),
  listShares: endpoint({
    method: 'GET',
    path: '/api/drive/shares',
    access: 'member',
    summary: 'Share links the caller made, for one item or all, one page at a time',
    params: NOTHING,
    query: z.strictObject({ itemId: ID.optional(), cursor: DRIVE_CURSOR.optional() }),
    body: NO_BODY,
    response: pageOf(DRIVE_SHARE),
  }),
  createShare: endpoint({
    method: 'POST',
    path: '/api/drive/shares',
    access: 'member',
    summary: 'Make a share link to a file or folder, optionally with a password and an end date',
    params: NOTHING,
    query: NOTHING,
    body: DRIVE_SHARE_CREATE,
    response: DRIVE_SHARE_CREATED,
  }),
  revokeShare: endpoint({
    method: 'DELETE',
    path: '/api/drive/shares/:shareId',
    access: 'member',
    summary: 'Stop a share link from working',
    params: SHARE_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
  unlockShare: endpoint({
    method: 'POST',
    path: '/s/:token',
    access: 'public',
    summary: 'Check a share link’s password and answer a short-lived signed path to its content',
    params: z.strictObject({ token: DRIVE_SHARE_TOKEN }),
    query: NOTHING,
    body: DRIVE_SHARE_UNLOCK,
    response: MEDIA_LINK,
  }),
  readUsage: endpoint({
    method: 'GET',
    path: '/api/drive/usage',
    access: 'member',
    summary: 'Space used by each person in files, versions and trash; a member sees their own',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(DRIVE_USAGE),
  }),
  listQuotas: endpoint({
    method: 'GET',
    path: '/api/drive/quotas',
    access: 'owner',
    summary: 'The space limit set for each person who has one',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(DRIVE_QUOTA),
  }),
  setQuota: endpoint({
    method: 'PUT',
    path: '/api/drive/quotas',
    access: 'owner',
    summary: 'Set or clear the space limit of a person',
    params: NOTHING,
    query: NOTHING,
    body: DRIVE_QUOTA_SET,
    response: DONE,
  }),
  readHealth: endpoint({
    method: 'GET',
    path: '/api/drive/health',
    access: 'member',
    summary: 'Whether the library is intact: hashed, verified, corrupt files, disks and backup',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: DRIVE_HEALTH,
  }),
  startScrub: endpoint({
    method: 'POST',
    path: '/api/drive/health/scrub',
    access: 'owner',
    summary: 'Start checking every file against its stored hash',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: DRIVE_SCRUB_STATE,
  }),
  reportBackup: endpoint({
    method: 'POST',
    path: '/api/drive/backups',
    access: 'owner',
    summary: 'Record the outcome of a backup an outside tool made of the library',
    params: NOTHING,
    query: NOTHING,
    body: DRIVE_BACKUP_REPORT_INPUT,
    response: DRIVE_BACKUP_REPORT,
  }),
  readBackupStatus: endpoint({
    method: 'GET',
    path: '/api/drive/backups',
    access: 'owner',
    summary: 'The last backup report and the last time a backup succeeded',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: DRIVE_BACKUP_STATUS,
  }),
  listConflicts: endpoint({
    method: 'GET',
    path: '/api/drive/conflicts',
    access: 'member',
    summary: 'Sync conflicts waiting to be settled, one page at a time',
    params: NOTHING,
    query: DRIVE_ROOT_PAGE_QUERY,
    body: NO_BODY,
    response: pageOf(DRIVE_CONFLICT),
  }),
  resolveConflict: endpoint({
    method: 'POST',
    path: '/api/drive/conflicts/resolve',
    access: 'member',
    summary: 'Settle a sync conflict by keeping the hub copy, the device copy or both',
    params: NOTHING,
    query: NOTHING,
    body: DRIVE_CONFLICT_RESOLVE,
    response: DRIVE_CONFLICT,
  }),
  listSyncClients: endpoint({
    method: 'GET',
    path: '/api/drive/sync/clients',
    access: 'member',
    summary: 'The devices that sync a library folder, with progress and errors',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(DRIVE_SYNC_CLIENT),
  }),
  updateSyncClient: endpoint({
    method: 'PATCH',
    path: '/api/drive/sync/clients',
    access: 'member',
    summary: 'Turn syncing on or off for a device and choose which folders it keeps',
    params: NOTHING,
    query: NOTHING,
    body: DRIVE_SYNC_CLIENT_UPDATE,
    response: DRIVE_SYNC_CLIENT,
  }),
  readDriveSettings: endpoint({
    method: 'GET',
    path: '/api/drive/settings',
    access: 'member',
    summary: 'The library settings: upload expiry, member sharing, duplicate hashing and indexing',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: DRIVE_SETTINGS,
  }),
  updateDriveSettings: endpoint({
    method: 'PATCH',
    path: '/api/drive/settings',
    access: 'owner',
    summary: 'Change the library settings',
    params: NOTHING,
    query: NOTHING,
    body: DRIVE_SETTINGS_UPDATE,
    response: DRIVE_SETTINGS,
  }),
} as const;
