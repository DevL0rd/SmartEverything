import { z } from 'zod';

export const SHELLY_ID = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const SHELLY_COMPONENT_KEY = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z][a-z0-9]*(?::[0-9]+)?$/);
export const SHELLY_COMPONENT_ID = z.int().min(0).max(65535);
export const SHELLY_TEXT = z.string().max(300);
export const SHELLY_NAME = z.string().max(64).nullable();
export const SHELLY_TIME = z.string().regex(/^(?:[01]?\d|2[0-3]):[0-5]?\d$/);
export const SHELLY_TIME_WINDOW = z.union([z.tuple([SHELLY_TIME, SHELLY_TIME]), z.tuple([])]);
export const SHELLY_SEGMENT = z.tuple([z.int(), z.int(), z.int(), z.int()]);
export const SHELLY_AREA = z.array(SHELLY_SEGMENT).max(1024);
export const SHELLY_RGB = z.tuple([
  z.int().min(0).max(255),
  z.int().min(0).max(255),
  z.int().min(0).max(255),
]);
export const SHELLY_ERRORS = z.array(z.string().min(1).max(100)).max(32);
export const SHELLY_TLS_CA = z.enum(['ca.pem', 'user_ca.pem', '*']).nullable();
export const SHELLY_REVISION = z.int().nonnegative();
export const SHELLY_EMPTY = z.strictObject({});
export const SHELLY_RESTART_RESULT = z.object({ restart_required: z.boolean().optional() });
export type ShellySegment = z.output<typeof SHELLY_SEGMENT>;
export type ShellyArea = z.output<typeof SHELLY_AREA>;
