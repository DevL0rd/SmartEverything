import { z } from 'zod';

const MOMENT = z.iso.datetime({ offset: true });

export const DRIVE_FILE = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    mimeType: z.string().min(1),
    parents: z.array(z.string().min(1)).optional(),
    size: z
      .string()
      .regex(/^\d+$/)
      .transform((text) => Number(text))
      .optional(),
    modifiedTime: MOMENT,
  })
  .readonly();

export type DriveFile = z.infer<typeof DRIVE_FILE>;

export const DRIVE_PAGE = z
  .object({
    files: z.array(DRIVE_FILE).readonly(),
    nextPageToken: z.string().min(1).optional(),
  })
  .readonly();

export const DRIVE_FILE_FIELDS = 'id,name,mimeType,parents,size,modifiedTime';

const DURATION = z
  .string()
  .regex(/^\d+(\.\d+)?s$/)
  .transform((text) => Math.round(Number.parseFloat(text) * 1000));

export const PICKER_SESSION = z
  .object({
    id: z.string().min(1),
    pickerUri: z.string().min(1),
    pollingConfig: z.object({ pollInterval: DURATION, timeoutIn: DURATION }).optional(),
    mediaItemsSet: z.boolean().optional(),
  })
  .readonly();

export type PickerSession = z.infer<typeof PICKER_SESSION>;

export const PICKED_ITEM = z
  .object({
    id: z.string().min(1),
    createTime: MOMENT,
    type: z.enum(['TYPE_UNSPECIFIED', 'PHOTO', 'VIDEO']),
    mediaFile: z.object({
      baseUrl: z.string().min(1),
      mimeType: z.string().min(1),
      filename: z.string().min(1),
      mediaFileMetadata: z
        .object({
          videoMetadata: z.object({ processingStatus: z.string().optional() }).optional(),
        })
        .optional(),
    }),
  })
  .readonly();

export type PickedItem = z.infer<typeof PICKED_ITEM>;

export const PICKED_PAGE = z
  .object({
    mediaItems: z.array(PICKED_ITEM).readonly().optional(),
    nextPageToken: z.string().min(1).optional(),
  })
  .readonly();

export const GOOGLE_ERROR = z.object({
  error: z.object({ code: z.number(), message: z.string().optional() }),
});
