import { z } from 'zod';

export const SHELLY_COMPONENT_ID = z.int().nonnegative();
export const SHELLY_COMPONENT_KEY = z.string().regex(/^[a-z][a-z0-9]*(?::[0-9]+)?$/);
export const SHELLY_SEGMENT = z.tuple([z.int(), z.int(), z.int(), z.int()]);
export const SHELLY_AREA = z.array(SHELLY_SEGMENT);
export const SHELLY_RGB = z.tuple([z.int(), z.int(), z.int()]);
export const SHELLY_TIME_WINDOW = z.union([z.tuple([z.string(), z.string()]), z.tuple([])]);
export const SHELLY_REVISION = z.int().nonnegative();
export type ShellySegment = z.output<typeof SHELLY_SEGMENT>;
export type ShellyArea = z.output<typeof SHELLY_AREA>;
