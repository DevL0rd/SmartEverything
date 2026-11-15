import { z } from 'zod';
import { PHOTO_RECIPE } from './edit-recipe';
import { PHOTO_BOX, PHOTO_POINT } from './people';
import { COUNT, ID, NAME } from './shared';

export const PHOTO_IMAGE_DATA_URL = z
  .string()
  .regex(/^data:image\/(?:png|webp);base64,[A-Za-z0-9+/]+={0,2}$/);

export const PHOTO_SAVE_MODES = ['version', 'copy'] as const;

export type PhotoSaveMode = (typeof PHOTO_SAVE_MODES)[number];

export const PHOTO_EDIT = z
  .strictObject({
    itemId: ID,
    recipe: PHOTO_RECIPE.nullable(),
    baseVersionId: ID.nullable(),
    edited: z.boolean(),
    canEdit: z.boolean(),
    canSaveVersion: z.boolean(),
    copyOnlyReason: NAME.nullable(),
  })
  .refine((edit) => edit.canSaveVersion === (edit.copyOnlyReason === null), {
    message: 'a photo that can only be saved as a copy says why',
    path: ['copyOnlyReason'],
  })
  .readonly();

export type PhotoEdit = z.infer<typeof PHOTO_EDIT>;

export const PHOTO_EDIT_BASE = z
  .strictObject({ itemId: ID, baseVersionId: ID.nullable(), image: PHOTO_IMAGE_DATA_URL })
  .readonly();

export type PhotoEditBase = z.infer<typeof PHOTO_EDIT_BASE>;

export const PHOTO_EDIT_SAVE = z.strictObject({
  recipe: PHOTO_RECIPE,
  mode: z.enum(PHOTO_SAVE_MODES),
});

export type PhotoEditSave = z.infer<typeof PHOTO_EDIT_SAVE>;

export const PHOTO_EDIT_SAVED = z.strictObject({ itemId: ID, rev: z.int().positive() }).readonly();

export type PhotoEditSaved = z.infer<typeof PHOTO_EDIT_SAVED>;

export const PHOTO_ERASE_STROKE = z
  .strictObject({ size: z.number().positive().max(1), points: z.array(PHOTO_POINT).min(1) })
  .readonly();

export const PHOTO_ERASE = z.strictObject({
  strokes: z.array(PHOTO_ERASE_STROKE).min(1).readonly(),
});

export type PhotoErase = z.infer<typeof PHOTO_ERASE>;

export const PHOTO_ERASED = z
  .strictObject({ patchId: ID, box: PHOTO_BOX, png: PHOTO_IMAGE_DATA_URL })
  .readonly();

export type PhotoErased = z.infer<typeof PHOTO_ERASED>;

export const PHOTO_EDIT_PATCH_PARAMS = z.strictObject({ itemId: ID, patchId: ID });

export const PHOTO_EDIT_PATCH = z
  .strictObject({ patchId: ID, png: PHOTO_IMAGE_DATA_URL })
  .readonly();

export type PhotoEditPatch = z.infer<typeof PHOTO_EDIT_PATCH>;

export const VIDEO_TRIM = z
  .strictObject({ startMs: COUNT, endMs: COUNT })
  .refine((trim) => trim.endMs > trim.startMs, {
    message: 'the trim ends after it starts',
    path: ['endMs'],
  });

export const VIDEO_EDIT = z
  .strictObject({
    trim: VIDEO_TRIM.nullable(),
    stabilize: z.boolean(),
    mode: z.enum(PHOTO_SAVE_MODES),
  })
  .refine((edit) => edit.trim !== null || edit.stabilize, {
    message: 'trim the video, stabilize it or both',
    path: ['trim'],
  });

export type VideoEdit = z.infer<typeof VIDEO_EDIT>;

export const EDIT_JOB_STATES = ['queued', 'running', 'done', 'failed'] as const;

export type EditJobState = (typeof EDIT_JOB_STATES)[number];

export const EDIT_JOB_PARAMS = z.strictObject({ jobId: ID });

export const EDIT_JOB = z
  .strictObject({
    id: ID,
    itemId: ID,
    state: z.enum(EDIT_JOB_STATES),
    progress: z.number().min(0).max(1),
    resultItemId: ID.nullable(),
    error: NAME.nullable(),
  })
  .refine((job) => (job.state === 'done') === (job.resultItemId !== null), {
    message: 'a finished job names the saved item and no other job does',
    path: ['resultItemId'],
  })
  .refine((job) => (job.state === 'failed') === (job.error !== null), {
    message: 'a failed job says why and no other job does',
    path: ['error'],
  })
  .refine((job) => job.state !== 'done' || job.progress === 1, {
    message: 'a finished job is complete',
    path: ['progress'],
  })
  .readonly();

export type EditJob = z.infer<typeof EDIT_JOB>;

export const PHOTOS_EDIT_JOB_NOTICE = z.strictObject({
  type: z.literal('photos_edit_job'),
  profileId: ID,
  job: EDIT_JOB,
});

export type PhotosEditJobNotice = z.infer<typeof PHOTOS_EDIT_JOB_NOTICE>;

export const EDIT_JOB_STARTED = z.strictObject({ jobId: ID }).readonly();
