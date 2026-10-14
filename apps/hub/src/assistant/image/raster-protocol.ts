import { z } from 'zod';
import {
  IMAGE_BYTES_MAX,
  IMAGE_MIME,
  IMAGE_PIXELS_MAX,
  IMAGE_PREVIEW_BYTES_MAX,
  IMAGE_SIDE_MAX,
} from '@smarteverything/domain';

const IMAGE_BUFFER = z
  .instanceof(Buffer)
  .refine((value) => value.length > 0 && value.length <= IMAGE_BYTES_MAX);
const DIMENSIONS = z
  .strictObject({
    mime: IMAGE_MIME,
    width: z.int().positive().max(IMAGE_SIDE_MAX),
    height: z.int().positive().max(IMAGE_SIDE_MAX),
  })
  .refine((value) => value.width * value.height <= IMAGE_PIXELS_MAX);
export const RASTER_REQUEST = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('probe') }),
  z.strictObject({
    kind: z.literal('validate'),
    content: IMAGE_BUFFER,
    declared: z.string().max(100).optional(),
  }),
  z.strictObject({ kind: z.literal('preview'), content: IMAGE_BUFFER }),
]);
export const RASTER_REPLY = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('ready'),
    nodeMajor: z.int().min(24),
    platform: z.string(),
    arch: z.string(),
    electron: z.literal(false),
  }),
  z.strictObject({ kind: z.literal('validated'), metadata: DIMENSIONS }),
  z.strictObject({
    kind: z.literal('preview'),
    content: z
      .instanceof(Buffer)
      .refine((value) => value.length > 0 && value.length <= IMAGE_PREVIEW_BYTES_MAX),
    width: z.int().positive().max(512),
    height: z.int().positive().max(512),
  }),
  z.strictObject({ kind: z.literal('error'), code: z.enum(['invalid_media', 'limit', 'unknown']) }),
]);
export type RasterRequest = z.infer<typeof RASTER_REQUEST>;
export type RasterReply = z.infer<typeof RASTER_REPLY>;
export type RasterResult = Exclude<RasterReply, { kind: 'ready' | 'error' }>;
