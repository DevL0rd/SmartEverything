import { z } from 'zod';
import { clientPref, noLegacy } from '../client-pref-definition';
import { DRIVE_NOTIFICATION_KIND, DRIVE_NOTIFICATION_KINDS } from './notification';

export const DRIVE_HINTS_PREF = z.strictObject({
  editBeatsDeleteSeen: z
    .boolean()
    .describe('The person has read, in Drive Sync, that an edit beats a delete'),
});

export type DriveHintsPref = z.infer<typeof DRIVE_HINTS_PREF>;

export const DRIVE_NOTIFICATIONS_PREF = z.strictObject({
  pushKinds: z
    .array(DRIVE_NOTIFICATION_KIND)
    .refine((kinds) => new Set(kinds).size === kinds.length, { message: 'name each kind once' })
    .describe('The Drive notification kinds that also arrive as a push message on the phone'),
});

export type DriveNotificationsPref = z.infer<typeof DRIVE_NOTIFICATIONS_PREF>;

export const DRIVE_CLIENT_PREFS = {
  drive_hints: clientPref({
    storageKey: 'drive-hints',
    scope: 'profile',
    version: 1,
    defaultValue: { editBeatsDeleteSeen: false },
    schema: DRIVE_HINTS_PREF,
    legacy: noLegacy,
  }),
  drive_notifications: clientPref({
    storageKey: 'drive-notifications',
    scope: 'profile',
    version: 1,
    defaultValue: { pushKinds: [...DRIVE_NOTIFICATION_KINDS] },
    schema: DRIVE_NOTIFICATIONS_PREF,
    legacy: noLegacy,
  }),
} as const;
