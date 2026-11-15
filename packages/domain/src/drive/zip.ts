import { z } from 'zod';
import { DRIVE_ITEM_KINDS } from './item';

const MOMENT = z.iso.datetime({ offset: true });
const COUNT = z.int().nonnegative();

export const DRIVE_ZIP_ENTRY = z
  .strictObject({
    index: COUNT,
    path: z.string().min(1),
    name: z.string().min(1),
    folder: z.boolean(),
    bytes: COUNT,
    compressedBytes: COUNT,
    modifiedAt: MOMENT.nullable(),
    encrypted: z.boolean(),
    kind: z.enum(DRIVE_ITEM_KINDS),
  })
  .refine((entry) => entry.folder === (entry.kind === 'folder'), {
    message: 'a folder entry has the folder kind and no other entry does',
    path: ['kind'],
  })
  .readonly();

export type DriveZipEntry = z.infer<typeof DRIVE_ZIP_ENTRY>;

export const DRIVE_ZIP_TOTALS = z
  .strictObject({
    files: COUNT,
    folders: COUNT,
    bytes: COUNT,
    compressedBytes: COUNT,
  })
  .readonly();

export type DriveZipTotals = z.infer<typeof DRIVE_ZIP_TOTALS>;

export const DRIVE_ZIP_PAGE = z
  .strictObject({
    items: z.array(DRIVE_ZIP_ENTRY).readonly(),
    next: z.string().min(1).nullable(),
    totals: DRIVE_ZIP_TOTALS,
  })
  .readonly();

export type DriveZipPage = z.infer<typeof DRIVE_ZIP_PAGE>;
