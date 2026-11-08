import { z } from 'zod';

const SHAPE = {
  uploadExpiryDays: z.int().positive(),
  membersMayShare: z.boolean(),
  duplicatesHashing: z.boolean(),
  indexingPaused: z.boolean(),
};

export const DRIVE_SETTINGS = z.strictObject(SHAPE).readonly();

export type DriveSettings = z.infer<typeof DRIVE_SETTINGS>;

export const DRIVE_SETTINGS_UPDATE = z
  .strictObject({
    uploadExpiryDays: SHAPE.uploadExpiryDays.optional(),
    membersMayShare: SHAPE.membersMayShare.optional(),
    duplicatesHashing: SHAPE.duplicatesHashing.optional(),
    indexingPaused: SHAPE.indexingPaused.optional(),
  })
  .refine((update) => Object.values(update).some((value) => value !== undefined), {
    message: 'an update changes at least one setting',
  })
  .readonly();

export type DriveSettingsUpdate = z.infer<typeof DRIVE_SETTINGS_UPDATE>;
