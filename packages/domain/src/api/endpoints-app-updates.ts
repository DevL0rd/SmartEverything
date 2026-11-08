import { z } from 'zod';
import { ANDROID_APK_RELEASE } from '../android-apk-updates';
import {
  ANDROID_APP_BUILD,
  ANDROID_APP_BUILD_REPORT,
  ANDROID_APP_OBSERVATION,
  APP_UPDATE_ENTRY,
  APP_UPDATE_FILE,
  APP_UPDATE_KEY_REPLY,
  APP_UPDATE_LISTING,
  APP_UPDATE_OFFER,
  APP_UPDATE_OUTCOME,
  APP_UPDATE_QUERY,
  APP_UPDATE_SUMMARY,
  APP_UPDATE_TARGET,
  PAIRED_ANDROID_BUILD,
} from '../app-updates';
import { MEDIA_LINK } from './endpoints-media';
import { NO_BODY, endpoint } from './endpoint';
import { DONE, ID, NOTHING } from './primitives';

export const ANDROID_UPDATE_HISTORY_QUERY = ANDROID_APP_BUILD.extend({
  channel: ANDROID_APK_RELEASE.shape.channel,
  runtimeVersion: ANDROID_APP_BUILD_REPORT.shape.runtimeVersion,
  currentId: ANDROID_APP_BUILD_REPORT.shape.currentUpdateId.unwrap().optional(),
  embeddedAt: APP_UPDATE_SUMMARY.shape.createdAt.optional(),
  offerKind: z.enum(['apk', 'ota']),
  offerId: z.uuid(),
});

export type AndroidUpdateHistoryQuery = z.infer<typeof ANDROID_UPDATE_HISTORY_QUERY>;

const ANDROID_UPDATE_HISTORY_ROW = APP_UPDATE_SUMMARY.pick({
  id: true,
  createdAt: true,
  appVersion: true,
  notes: true,
}).extend({ kind: ANDROID_UPDATE_HISTORY_QUERY.shape.offerKind });

export type AndroidUpdateHistoryRow = z.infer<typeof ANDROID_UPDATE_HISTORY_ROW>;

const ANDROID_UPDATE_HISTORY = z.strictObject({
  releases: z.array(ANDROID_UPDATE_HISTORY_ROW),
});

export type AndroidUpdateHistory = z.infer<typeof ANDROID_UPDATE_HISTORY>;

export const APP_UPDATE_BLOB_UPLOAD_PATH = '/api/app-updates/blobs/:sha256';

export const APP_UPDATE_BLOB_STAGED = z.strictObject({
  sha256: APP_UPDATE_FILE.shape.sha256,
  size: z.int().nonnegative(),
});

export type AppUpdateBlobStaged = z.infer<typeof APP_UPDATE_BLOB_STAGED>;

const PUBLICATION_OMITTED = { id: true, clientId: true, createdAt: true, withdrawn: true } as const;

export const APP_UPDATE_PUBLICATION = z.discriminatedUnion('platform', [
  APP_UPDATE_ENTRY.options[0].omit(PUBLICATION_OMITTED),
  APP_UPDATE_ENTRY.options[1].omit(PUBLICATION_OMITTED),
]);

export type AppUpdatePublication = z.infer<typeof APP_UPDATE_PUBLICATION>;

const UPDATE_REASON = z.string().trim().min(1);

export const APP_UPDATE_PROMOTION = z.strictObject({
  id: z.uuid(),
  channel: APP_UPDATE_TARGET.shape.channel,
});

export const APP_UPDATE_ROLLBACK = APP_UPDATE_TARGET.omit({ runtimeVersion: true }).extend({
  reason: UPDATE_REASON,
  toEmbedded: z.boolean(),
});

export const APP_UPDATE_WITHDRAWAL = z.strictObject({ id: z.uuid(), reason: UPDATE_REASON });

export const APP_UPDATE_CHANGE = z.strictObject({ entries: z.array(APP_UPDATE_ENTRY) });

export type AppUpdateChange = z.infer<typeof APP_UPDATE_CHANGE>;

export const APP_UPDATE_PRUNED = z.strictObject({ removed: z.array(z.string().min(1)) });

export type AppUpdatePruned = z.infer<typeof APP_UPDATE_PRUNED>;

export const APP_UPDATE_ENDPOINTS = {
  readAndroidApkOffer: endpoint({
    method: 'GET',
    path: '/api/app-updates/android/apk',
    access: 'member',
    summary: 'Read the signed Android installer available for this paired Android app',
    params: NOTHING,
    query: ANDROID_APP_BUILD.extend({ channel: ANDROID_APK_RELEASE.shape.channel }),
    body: NO_BODY,
    response: z.strictObject({ release: ANDROID_APK_RELEASE, download: MEDIA_LINK }).nullable(),
  }),
  readAndroidUpdateHistory: endpoint({
    method: 'GET',
    path: '/api/app-updates/android/history',
    access: 'member',
    summary: 'Read changes since this paired Android app’s running build for the selected update',
    params: NOTHING,
    query: ANDROID_UPDATE_HISTORY_QUERY,
    body: NO_BODY,
    response: ANDROID_UPDATE_HISTORY,
  }),
  readAppUpdate: endpoint({
    method: 'GET',
    path: '/api/app-updates/latest',
    access: 'member',
    summary:
      'Read the newest over-the-air app update this home offers for one platform, channel and runtime version, whether a newer update needs a new app build, and whether to roll back to the embedded build',
    params: NOTHING,
    query: APP_UPDATE_QUERY,
    body: NO_BODY,
    response: APP_UPDATE_OFFER,
  }),
  listAppUpdates: endpoint({
    method: 'GET',
    path: '/api/app-updates',
    access: 'owner',
    summary:
      'List every over-the-air app update stored on this home with its platform, channel, runtime version, size and whether it was withdrawn',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(APP_UPDATE_LISTING),
  }),
  publishAppUpdate: endpoint({
    method: 'POST',
    path: '/api/app-updates',
    access: 'owner',
    summary:
      'Publish an over-the-air app update whose files were uploaded to PUT /api/app-updates/blobs/:sha256: this home assigns the id and time, checks every file against its size, and records the update only when it is newer than and different from the update already offered',
    params: NOTHING,
    query: NOTHING,
    body: APP_UPDATE_PUBLICATION,
    response: APP_UPDATE_ENTRY,
  }),
  promoteAppUpdate: endpoint({
    method: 'POST',
    path: '/api/app-updates/promote',
    access: 'owner',
    summary:
      'Copy a stored over-the-air app update to another channel under a new id and time so devices on that channel take it',
    params: NOTHING,
    query: NOTHING,
    body: APP_UPDATE_PROMOTION,
    response: APP_UPDATE_CHANGE,
  }),
  rollbackAppUpdate: endpoint({
    method: 'POST',
    path: '/api/app-updates/rollback',
    access: 'owner',
    summary:
      'Withdraw the newest live over-the-air app update of a platform and channel and republish the previous good one, or withdraw them all so devices return to the embedded build',
    params: NOTHING,
    query: NOTHING,
    body: APP_UPDATE_ROLLBACK,
    response: APP_UPDATE_CHANGE,
  }),
  withdrawAppUpdate: endpoint({
    method: 'POST',
    path: '/api/app-updates/withdraw',
    access: 'owner',
    summary:
      'Withdraw one stored over-the-air app update; when it is the newest of its target the previous good one is republished',
    params: NOTHING,
    query: NOTHING,
    body: APP_UPDATE_WITHDRAWAL,
    response: APP_UPDATE_CHANGE,
  }),
  pruneAppUpdateBlobs: endpoint({
    method: 'POST',
    path: '/api/app-updates/prune',
    access: 'owner',
    summary: 'Delete the stored update files that no update entry refers to',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: APP_UPDATE_PRUNED,
  }),
  readAppUpdateKey: endpoint({
    method: 'GET',
    path: '/api/app-updates/key',
    access: 'member',
    summary:
      'Read the key the calling device sends when its app asks this home for an over-the-air update; the key opens only the update manifest',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: APP_UPDATE_KEY_REPLY,
  }),
  readAndroidAppBuild: endpoint({
    method: 'GET',
    path: '/api/app-updates/android/:clientId/build',
    access: 'owner',
    summary:
      'Read the latest Android build, runtime and update outcome reported by one paired device, or null when the device has never reported',
    params: z.strictObject({ clientId: ID }),
    query: NOTHING,
    body: NO_BODY,
    response: ANDROID_APP_OBSERVATION.nullable(),
  }),
  readAndroidAppBuilds: endpoint({
    method: 'GET',
    path: '/api/app-updates/android/builds',
    access: 'owner',
    summary: 'Read the latest build and update outcome reported by each paired Android app',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(PAIRED_ANDROID_BUILD),
  }),
  reportAndroidAppBuild: endpoint({
    method: 'POST',
    path: '/api/app-updates/android/build',
    access: 'member',
    summary: 'Report the native build, runtime and running update of the calling Android app',
    params: NOTHING,
    query: NOTHING,
    body: ANDROID_APP_BUILD_REPORT,
    response: DONE,
  }),
  reportAppUpdate: endpoint({
    method: 'POST',
    path: '/api/app-updates/outcomes',
    access: 'member',
    summary:
      'Report that an over-the-air app update was applied, rolled back or failed to download on the calling device',
    params: NOTHING,
    query: NOTHING,
    body: APP_UPDATE_OUTCOME,
    response: DONE,
  }),
} as const;
