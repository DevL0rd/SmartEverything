import { z } from 'zod';

export const OCR_LANGUAGE = z.string().regex(/^[a-z]{3}(?:_[a-z]+)?$/);

const OCR_LANGUAGES = z
  .array(OCR_LANGUAGE)
  .min(1)
  .refine((languages) => new Set(languages).size === languages.length, {
    message: 'name each language once',
  })
  .readonly();

export const MAX_FILE_IO_THREADS = 1024;

const SHAPE = {
  uploadExpiryDays: z.int().positive(),
  membersMayShare: z.boolean(),
  duplicatesHashing: z.boolean(),
  indexingPaused: z.boolean(),
  contentIndexing: z.boolean(),
  ocrLanguages: OCR_LANGUAGES,
  fileIoThreads: z.int().min(1).max(MAX_FILE_IO_THREADS),
  cpuWorkers: z.int().positive(),
  listingCacheSeconds: z.int().nonnegative(),
};

export const DRIVE_SETTINGS = z.strictObject(SHAPE).readonly();

export type DriveSettings = z.infer<typeof DRIVE_SETTINGS>;

export const DRIVE_SETTINGS_UPDATE = z
  .strictObject({
    uploadExpiryDays: SHAPE.uploadExpiryDays.optional(),
    membersMayShare: SHAPE.membersMayShare.optional(),
    duplicatesHashing: SHAPE.duplicatesHashing.optional(),
    indexingPaused: SHAPE.indexingPaused.optional(),
    contentIndexing: SHAPE.contentIndexing.optional(),
    ocrLanguages: SHAPE.ocrLanguages.optional(),
    fileIoThreads: SHAPE.fileIoThreads.optional(),
    cpuWorkers: SHAPE.cpuWorkers.optional(),
    listingCacheSeconds: SHAPE.listingCacheSeconds.optional(),
  })
  .refine((update) => Object.values(update).some((value) => value !== undefined), {
    message: 'an update changes at least one setting',
  })
  .readonly();

export type DriveSettingsUpdate = z.infer<typeof DRIVE_SETTINGS_UPDATE>;

export const DEFAULT_FILE_IO_THREADS = 8;

export const DEFAULT_LISTING_CACHE_SECONDS = 300;

export const DRIVE_SETTINGS_RUNNING = z
  .strictObject({ fileIoThreads: SHAPE.fileIoThreads })
  .readonly();

export type DriveSettingsRunning = z.infer<typeof DRIVE_SETTINGS_RUNNING>;
