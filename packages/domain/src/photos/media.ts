import { z } from 'zod';
import { ID, PLACE_ID } from './shared';

export const MEDIA_TIME_SOURCES = ['exif', 'gps', 'file'] as const;

export type MediaTimeSource = (typeof MEDIA_TIME_SOURCES)[number];

export const MEDIA_STATE = z
  .discriminatedUnion('state', [
    z.strictObject({ state: z.literal('none') }),
    z.strictObject({ state: z.literal('processing') }),
    z.strictObject({ state: z.literal('ready') }),
    z.strictObject({ state: z.literal('failed'), reason: z.string().min(1) }),
    z.strictObject({ state: z.literal('unsupported'), reason: z.string().min(1) }),
  ])
  .readonly();

export type MediaState = z.infer<typeof MEDIA_STATE>;

export const MEDIA_INFO = z
  .strictObject({
    itemId: ID,
    timeSource: z.enum(MEDIA_TIME_SOURCES).nullable(),
    tzOffsetMin: z.int().min(-1440).max(1440).nullable(),
    motionClipId: ID.nullable(),
    liveId: z.string().min(1).nullable(),
    burstId: z.string().min(1).nullable(),
    stackId: ID.nullable(),
    placeId: PLACE_ID.nullable(),
    preview: MEDIA_STATE,
    poster: MEDIA_STATE,
    playable: MEDIA_STATE,
  })
  .readonly();

export type MediaInfo = z.infer<typeof MEDIA_INFO>;

export const MEDIA_JOB_KINDS = [
  'hash',
  'metadata',
  'preview',
  'thumb',
  'poster',
  'playable',
  'motion',
  'place',
  'stack',
  'duplicate',
] as const;

export const MEDIA_JOB_STATES = ['queued', 'running', 'done', 'failed'] as const;

export const MEDIA_JOB = z
  .strictObject({
    id: ID,
    kind: z.enum(MEDIA_JOB_KINDS),
    itemId: ID,
    rev: z.int().positive(),
    state: z.enum(MEDIA_JOB_STATES),
    attempts: z.int().nonnegative(),
    error: z.string().min(1).nullable(),
    modelVersion: z.string().min(1).nullable(),
    queuedAt: z.iso.datetime({ offset: true }),
  })
  .refine((job) => (job.state === 'failed') === (job.error !== null), {
    message: 'a failed job carries its error and no other job does',
    path: ['error'],
  })
  .readonly();

export type MediaJob = z.infer<typeof MEDIA_JOB>;

export const MEDIA_PROCESSING = z
  .strictObject({
    queued: z.int().nonnegative(),
    running: z.int().nonnegative(),
    failed: z.array(MEDIA_JOB).readonly(),
  })
  .readonly();

export type MediaProcessing = z.infer<typeof MEDIA_PROCESSING>;
