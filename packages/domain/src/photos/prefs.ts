import { z } from 'zod';
import { clientPref, noLegacy } from '../client-pref-definition';

export const PHOTOS_ZOOMS = ['years', 'months', 'days', 'comfortable'] as const;

export const PHOTOS_GROUPINGS = ['day', 'month'] as const;

export const PHOTOS_PREF = z.strictObject({
  showCameras: z.boolean().describe('Show camera recordings and snapshots in Photos'),
  showAi: z.boolean().describe('Show images made by the assistant in Photos'),
  timelineZoom: z.enum(PHOTOS_ZOOMS).describe('The zoom level the Photos timeline opens at'),
  timelineGroup: z
    .enum(PHOTOS_GROUPINGS)
    .describe('Whether the timeline groups items by day or month'),
  showVideos: z.boolean().describe('Show videos in the timeline'),
  showNotBackedUp: z
    .boolean()
    .describe('Show items that are still only on a phone, marked as not backed up'),
  memories: z.boolean().describe('Suggest on this day, trips and days out'),
  tripDistanceKm: z
    .number()
    .int()
    .positive()
    .describe('How many kilometres from home a trip starts'),
  yearInReview: z.boolean().describe('Offer a year in review'),
  excludedAlbumIds: z.array(z.uuid()).describe('Albums left out of the timeline, memories and map'),
  map: z.boolean().describe('Show where photos were taken'),
  removeLocationOutside: z
    .boolean()
    .describe('Links opened by people outside the home get copies without GPS data'),
});

export type PhotosPref = z.infer<typeof PHOTOS_PREF>;

export const PHOTOS_BACKUP_PREF = z.strictObject({
  enabled: z.boolean().describe('Copy this phone’s photos and videos to the server as originals'),
  albumIds: z.array(z.string().min(1)).describe('Phone albums that are backed up'),
  wifiOnly: z.boolean().describe('Back up only on Wi-Fi'),
  chargingOnly: z.boolean().describe('Back up only while charging'),
  includeVideos: z.boolean().describe('Back up videos as well as photos'),
});

export type PhotosBackupPref = z.infer<typeof PHOTOS_BACKUP_PREF>;

export const PHOTOS_CLIENT_PREFS = {
  photos: clientPref({
    storageKey: 'photos',
    scope: 'profile',
    version: 1,
    defaultValue: {
      showCameras: true,
      showAi: true,
      timelineZoom: 'days',
      timelineGroup: 'day',
      showVideos: true,
      showNotBackedUp: true,
      memories: true,
      tripDistanceKm: 50,
      yearInReview: true,
      excludedAlbumIds: [],
      map: true,
      removeLocationOutside: true,
    },
    schema: PHOTOS_PREF,
    legacy: noLegacy,
  }),
  photos_backup: clientPref({
    storageKey: 'photos-backup',
    scope: 'client',
    version: 1,
    defaultValue: {
      enabled: false,
      albumIds: [],
      wifiOnly: true,
      chargingOnly: false,
      includeVideos: true,
    },
    schema: PHOTOS_BACKUP_PREF,
    legacy: noLegacy,
  }),
} as const;
