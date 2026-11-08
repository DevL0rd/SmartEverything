import { z } from 'zod';
import type { HomeMapScanFormat } from '@smarteverything/domain';
import { VACUUM_TRAIL_RUN } from '@smarteverything/domain/vacuum-scene';
import type { ViewInsets } from './render-core-orbit';

export const POSE_MESSAGE = z.tuple([z.number(), z.number(), z.number(), z.number()]);

export const TRAIL_MESSAGE = z.tuple([z.string()]);

export const MODELS_MESSAGE = z.tuple([z.string()]);

export const LIVE_MESSAGE = z.tuple([z.string()]);

export const VIEW_INSETS = z.strictObject({
  top: z.number().min(0),
  bottom: z.number().min(0),
}) satisfies z.ZodType<ViewInsets>;

export const LIVE_TRAIL = z.strictObject({ base: z.boolean(), live: z.array(VACUUM_TRAIL_RUN) });

export type LiveTrailMessage = z.infer<typeof LIVE_TRAIL>;

export const SCAN_FORMATS = [
  'ply',
  'splat',
  'spz',
  'rad',
] as const satisfies readonly HomeMapScanFormat[];

export type ScanFormat = (typeof SCAN_FORMATS)[number];

export const SCAN_MESSAGE = z.tuple([z.string(), z.string(), z.enum(SCAN_FORMATS)]);

export const SCAN_PLACEMENT_MESSAGE = z.tuple([
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number().positive(),
  z.number().min(0).max(1),
]);

export const SCAN_BAND_MESSAGE = z.tuple([z.number(), z.number()]);
