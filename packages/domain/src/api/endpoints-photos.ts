import { z } from 'zod';
import {
  PHOTO_UPLOAD_TARGET_REQUEST,
  PHOTO_UPLOAD_TARGET,
  BACKUP_HAVE,
  BACKUP_HAVE_RESULT,
  BACKUP_REGISTER,
  BACKUP_DEVICE,
  BACKUP_STATE,
} from '../photos/backup';
import {
  DUPLICATE_GROUP,
  DUPLICATE_KEEP_BEST,
  DUPLICATE_KEEP_RESULT,
  DUPLICATE_NOT,
  DUPLICATE_STATS,
} from '../photos/duplicates';
import { PHOTO_INSIGHTS, PHOTO_INSIGHTS_QUERY } from '../photos/insights';
import { MEDIA_INFO, MEDIA_PROCESSING } from '../photos/media';
import { MEMORY, MEMORY_PARAMS, TRIP } from '../photos/memories';
import {
  PHOTO_PLACE,
  PLACE_CLUSTER,
  PLACE_CLUSTER_QUERY,
  PLACE_COUNTRY,
  PLACE_PARAMS,
} from '../photos/places';
import {
  SOURCE_KEEP,
  SOURCE_KEEP_RESULT,
  SOURCE_PAGE,
  SOURCE_PARAMS,
  SOURCE_QUERY,
} from '../photos/sources';
import { STACK, STACK_COVER, STACK_PARAMS } from '../photos/stacks';
import {
  TIMELINE_BUCKET,
  TIMELINE_PAGE,
  TIMELINE_PAGE_QUERY,
  TIMELINE_SCOPE,
} from '../photos/timeline';
import { DRIVE_QUERY_PAGE } from '../drive/query';
import { NO_BODY, endpoint } from './endpoint';
import { CURSOR_QUERY, DRIVE_ITEM_PARAMS, pageOf } from './endpoints-drive';
import { COUNT, DONE, ID, NOTHING } from './primitives';

const MONTH_PARAMS = z.strictObject({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) });

export const PHOTOS_PROGRESS_KINDS = ['preview', 'poster', 'playable', 'backup'] as const;

export const PHOTOS_PROGRESS_NOTICE = z
  .strictObject({
    type: z.literal('photos_progress'),
    kind: z.enum(PHOTOS_PROGRESS_KINDS),
    itemId: ID.optional(),
    deviceId: z.string().min(1).optional(),
    done: COUNT,
    total: COUNT,
  })
  .refine((progress) => progress.done <= progress.total, {
    message: 'done cannot pass total',
    path: ['done'],
  });

export type PhotosProgressNotice = z.infer<typeof PHOTOS_PROGRESS_NOTICE>;

export const PHOTO_RAIL_COUNTS = z
  .strictObject({
    timeline: COUNT,
    memories: COUNT,
    albums: COUNT,
    places: COUNT,
    favourites: COUNT,
    videos: COUNT,
    screenshots: COUNT,
    cameras: COUNT,
    ai: COUNT,
    duplicates: COUNT.nullable(),
    backupPhones: COUNT,
    deleted: COUNT,
  })
  .readonly();

export type PhotoRailCounts = z.infer<typeof PHOTO_RAIL_COUNTS>;

export const PHOTOS_ENDPOINTS = {
  resolvePhotoUploadTarget: endpoint({
    method: 'POST',
    path: '/api/drive/photos/uploads/target',
    access: 'member',
    summary: 'The library folder for a camera roll backup or a manual photo upload',
    params: NOTHING,
    query: NOTHING,
    body: PHOTO_UPLOAD_TARGET_REQUEST,
    response: PHOTO_UPLOAD_TARGET,
  }),
  readPhotoRailCounts: endpoint({
    method: 'GET',
    path: '/api/drive/photos/rail-counts',
    access: 'member',
    summary: 'How many items each Photos section holds, for the counts beside the section names',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: PHOTO_RAIL_COUNTS,
  }),
  readTimelineBuckets: endpoint({
    method: 'GET',
    path: '/api/drive/photos/timeline',
    access: 'member',
    summary: 'The months of the Photos timeline with how many photos and videos each holds',
    params: NOTHING,
    query: TIMELINE_SCOPE,
    body: NO_BODY,
    response: z.array(TIMELINE_BUCKET),
  }),
  readTimelinePage: endpoint({
    method: 'GET',
    path: '/api/drive/photos/timeline/:month',
    access: 'member',
    summary:
      'One month of the timeline as columns: ids, revisions, shapes, capture times, placeholders and flags',
    params: MONTH_PARAMS,
    query: TIMELINE_PAGE_QUERY,
    body: NO_BODY,
    response: TIMELINE_PAGE,
  }),
  readMediaInfo: endpoint({
    method: 'GET',
    path: '/api/drive/photos/media/:itemId',
    access: 'member',
    summary: 'How a photo or video was read: time source, live and stack links, preview states',
    params: DRIVE_ITEM_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: MEDIA_INFO,
  }),
  readMediaProcessing: endpoint({
    method: 'GET',
    path: '/api/drive/photos/processing',
    access: 'member',
    summary: 'How many photos wait for previews and which processing jobs failed',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: MEDIA_PROCESSING,
  }),
  listMemories: endpoint({
    method: 'GET',
    path: '/api/drive/photos/memories',
    access: 'member',
    summary: 'On this day, this week, days out, bursts, trips and the year in review',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(MEMORY),
  }),
  listMemoryItems: endpoint({
    method: 'GET',
    path: '/api/drive/photos/memories/:memoryId/items',
    access: 'member',
    summary: 'The photos and videos of one memory, one page at a time',
    params: MEMORY_PARAMS,
    query: CURSOR_QUERY,
    body: NO_BODY,
    response: DRIVE_QUERY_PAGE,
  }),
  listTrips: endpoint({
    method: 'GET',
    path: '/api/drive/photos/trips',
    access: 'member',
    summary: 'Trips found from gaps in capture dates, with distance from the home when known',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(TRIP),
  }),
  listPlaces: endpoint({
    method: 'GET',
    path: '/api/drive/photos/places',
    access: 'member',
    summary: 'Places photos were taken, grouped by country and city with counts and a cover',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(PLACE_COUNTRY),
  }),
  readPlace: endpoint({
    method: 'GET',
    path: '/api/drive/photos/places/:placeId',
    access: 'member',
    summary: 'One place with how many photos were taken there',
    params: PLACE_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: PHOTO_PLACE,
  }),
  listPlaceClusters: endpoint({
    method: 'GET',
    path: '/api/drive/photos/place-clusters',
    access: 'member',
    summary: 'Photo clusters for the world map at a zoom level, inside a view and a time range',
    params: NOTHING,
    query: PLACE_CLUSTER_QUERY,
    body: NO_BODY,
    response: z.array(PLACE_CLUSTER),
  }),
  readPhotoInsights: endpoint({
    method: 'GET',
    path: '/api/drive/photos/insights',
    access: 'member',
    summary: 'Charts and totals about the photos: kinds, cameras, folders, videos, days and places',
    params: NOTHING,
    query: PHOTO_INSIGHTS_QUERY,
    body: NO_BODY,
    response: PHOTO_INSIGHTS,
  }),
  listPhotoDuplicates: endpoint({
    method: 'GET',
    path: '/api/drive/photos/duplicates',
    access: 'member',
    summary:
      'Groups of identical photos and videos with the suggested keeper of each, one page at a time',
    params: NOTHING,
    query: CURSOR_QUERY,
    body: NO_BODY,
    response: pageOf(DUPLICATE_GROUP),
  }),
  readPhotoDuplicateStats: endpoint({
    method: 'GET',
    path: '/api/drive/photos/duplicates/stats',
    access: 'member',
    summary:
      'How many duplicate groups and extra copies there are, the bytes to win back and where',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: DUPLICATE_STATS,
  }),
  keepBestDuplicates: endpoint({
    method: 'POST',
    path: '/api/drive/photos/duplicates/keep-best',
    access: 'member',
    summary: 'Keep the best copy of chosen or all duplicate groups and trash the others',
    params: NOTHING,
    query: NOTHING,
    body: DUPLICATE_KEEP_BEST,
    response: DUPLICATE_KEEP_RESULT,
  }),
  markNotDuplicates: endpoint({
    method: 'POST',
    path: '/api/drive/photos/duplicates/not-duplicates',
    access: 'member',
    summary: 'Tell the hub these groups are not duplicates so they stop being suggested',
    params: NOTHING,
    query: NOTHING,
    body: DUPLICATE_NOT,
    response: DONE,
  }),
  listStacks: endpoint({
    method: 'GET',
    path: '/api/drive/photos/stacks',
    access: 'member',
    summary: 'Bursts and RAW plus JPEG pairs, one page at a time',
    params: NOTHING,
    query: CURSOR_QUERY,
    body: NO_BODY,
    response: pageOf(STACK),
  }),
  readStack: endpoint({
    method: 'GET',
    path: '/api/drive/photos/stacks/:stackId',
    access: 'member',
    summary: 'One stack with its cover and every photo in it',
    params: STACK_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: STACK,
  }),
  makeStackCover: endpoint({
    method: 'POST',
    path: '/api/drive/photos/stacks/:stackId/cover',
    access: 'member',
    summary: 'Choose which photo of a stack is shown on the timeline',
    params: STACK_PARAMS,
    query: NOTHING,
    body: STACK_COVER,
    response: STACK,
  }),
  listPhotoSource: endpoint({
    method: 'GET',
    path: '/api/drive/photos/sources/:source',
    access: 'member',
    summary:
      'Camera snapshots or Made with AI images, with chips and whether each is kept in Drive',
    params: SOURCE_PARAMS,
    query: SOURCE_QUERY,
    body: NO_BODY,
    response: SOURCE_PAGE,
  }),
  keepSourceItems: endpoint({
    method: 'POST',
    path: '/api/drive/photos/sources/:source/keep',
    access: 'member',
    summary: 'Keep camera snapshots or Made with AI images in Drive so they stay',
    params: SOURCE_PARAMS,
    query: NOTHING,
    body: SOURCE_KEEP,
    response: SOURCE_KEEP_RESULT,
  }),
  registerBackupDevice: endpoint({
    method: 'PUT',
    path: '/api/drive/photos/backup/devices',
    access: 'member',
    summary: 'Register this device for local photo and video backup or change its backup settings',
    params: NOTHING,
    query: NOTHING,
    body: BACKUP_REGISTER,
    response: BACKUP_DEVICE,
  }),
  lookupPhotoBackupHashes: endpoint({
    method: 'POST',
    path: '/api/drive/photos/backup/lookup',
    access: 'member',
    summary: 'Find backed-up media by content hash without changing backup progress',
    params: NOTHING,
    query: NOTHING,
    body: BACKUP_HAVE,
    response: BACKUP_HAVE_RESULT,
  }),
  checkBackupHashes: endpoint({
    method: 'POST',
    path: '/api/drive/photos/backup/have',
    access: 'member',
    summary: 'Tell which of the device’s photos the hub already has by their content hash',
    params: NOTHING,
    query: NOTHING,
    body: BACKUP_HAVE,
    response: BACKUP_HAVE_RESULT,
  }),
  readBackupState: endpoint({
    method: 'GET',
    path: '/api/drive/photos/backup/state',
    access: 'member',
    summary: 'Backup progress for each of the caller’s devices',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(BACKUP_STATE),
  }),
} as const;
