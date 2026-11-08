import { z } from 'zod';
import { clientPref, noLegacy } from '../client-pref-definition';

export const DRIVE_HINTS_PREF = z.strictObject({
  editBeatsDeleteSeen: z
    .boolean()
    .describe('The person has read, in Drive Sync, that an edit beats a delete'),
});

export type DriveHintsPref = z.infer<typeof DRIVE_HINTS_PREF>;

export const DRIVE_CLIENT_PREFS = {
  drive_hints: clientPref({
    storageKey: 'drive-hints',
    scope: 'profile',
    version: 1,
    defaultValue: { editBeatsDeleteSeen: false },
    schema: DRIVE_HINTS_PREF,
    legacy: noLegacy,
  }),
} as const;
