import { z } from 'zod';
import {
  SHELLY_COMPONENT_ID,
  SHELLY_COMPONENT_KEY,
  SHELLY_ERRORS,
  SHELLY_NAME,
} from './shelly-presence-primitives';
import { SHELLY_COMPONENT_META } from './shelly-presence-virtual';

export const SHELLY_BTHOME_ADDRESS = z.string().regex(/^(?:[0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/);
export const SHELLY_BTHOME_DEVICE_CONFIG = z.object({
  id: SHELLY_COMPONENT_ID,
  name: SHELLY_NAME.optional(),
  addr: SHELLY_BTHOME_ADDRESS,
  meta: SHELLY_COMPONENT_META.optional(),
});
export const SHELLY_BTHOME_DEVICE_PATCH = SHELLY_BTHOME_DEVICE_CONFIG.omit({ id: true })
  .partial()
  .strict()
  .extend({
    key: z
      .string()
      .regex(/^[0-9a-fA-F]{32}$/)
      .nullable()
      .optional(),
  });
export const SHELLY_BTHOME_SENSOR_CONFIG = z.object({
  id: SHELLY_COMPONENT_ID,
  name: SHELLY_NAME.optional(),
  obj_id: z.int().min(0).max(255),
  idx: z.int().nonnegative(),
  addr: SHELLY_BTHOME_ADDRESS,
  meta: SHELLY_COMPONENT_META.optional(),
});
export const SHELLY_BTHOME_SENSOR_PATCH = SHELLY_BTHOME_SENSOR_CONFIG.omit({ id: true })
  .partial()
  .strict();
export const SHELLY_BTHOME_DEVICE_STATUS = z.object({
  id: SHELLY_COMPONENT_ID.optional(),
  rssi: z.number().nullable().optional(),
  battery: z.number().nullable().optional(),
  packet_id: z.int().nullable().optional(),
  last_update_ts: z.number().nullable().optional(),
  paired: z.boolean().optional(),
  rpc: z.boolean().optional(),
  fw_ver: z.string().max(100).optional(),
  errors: SHELLY_ERRORS.optional(),
});
export const SHELLY_BTHOME_SENSOR_STATUS = z.object({
  id: SHELLY_COMPONENT_ID.optional(),
  value: z.union([z.number(), z.string().max(300), z.boolean(), z.null()]),
  last_update_ts: z.number().nullable().optional(),
});
export const SHELLY_BTHOME_COMPONENT = z.discriminatedUnion('component', [
  z.object({
    component: z.literal('bthome'),
    key: SHELLY_COMPONENT_KEY,
    config: z.object({ enable: z.boolean().optional() }),
    status: z
      .object({
        discovery: z.object({ started_at: z.number(), duration: z.number() }).optional(),
        errors: SHELLY_ERRORS.optional(),
      })
      .nullable(),
  }),
  z.object({
    component: z.literal('bthomedevice'),
    key: SHELLY_COMPONENT_KEY,
    config: SHELLY_BTHOME_DEVICE_CONFIG,
    status: SHELLY_BTHOME_DEVICE_STATUS.nullable(),
  }),
  z.object({
    component: z.literal('bthomesensor'),
    key: SHELLY_COMPONENT_KEY,
    config: SHELLY_BTHOME_SENSOR_CONFIG,
    status: SHELLY_BTHOME_SENSOR_STATUS.nullable(),
  }),
]);
export const SHELLY_BTHOME_OBJECT_INFOS = z.object({
  objects: z
    .array(
      z.object({
        obj_id: z.int(),
        obj_name: z.string().max(100).optional(),
        type: z.string().max(100).optional(),
        unit: z.string().max(40).optional(),
      }),
    )
    .max(256),
  count: z.int().nonnegative().optional(),
  offset: z.int().nonnegative().optional(),
  total: z.int().nonnegative().optional(),
});
export type ShellyBthomeComponent = z.output<typeof SHELLY_BTHOME_COMPONENT>;

export const SHELLY_BTHOME_KNOWN_OBJECTS = z.object({
  id: SHELLY_COMPONENT_ID,
  objects: z
    .array(
      z.object({
        obj_id: z.int().min(0).max(255),
        idx: z.int().nonnegative(),
        component: SHELLY_COMPONENT_KEY.nullable().optional(),
      }),
    )
    .max(256),
});
export const SHELLY_BTHOME_DISCOVERED = z.object({
  addr: SHELLY_BTHOME_ADDRESS,
  local_name: z.string().max(100).optional(),
  rssi: z.number(),
  encrypted: z.boolean(),
  shelly_mfdata: z
    .object({ flags: z.int(), model_id: z.int(), mac: SHELLY_BTHOME_ADDRESS })
    .optional(),
});
