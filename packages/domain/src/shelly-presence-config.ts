import { z } from 'zod';
import {
  SHELLY_AREA,
  SHELLY_COMPONENT_ID,
  SHELLY_ERRORS,
  SHELLY_NAME,
  SHELLY_RGB,
  SHELLY_TIME_WINDOW,
} from './shelly-presence-primitives';

const SENSOR_LEVEL = z.enum(['low', 'medium', 'high', 'small_room']);
export const SHELLY_SENSOR_STATE = z.object({
  det_act_thr: z.int().min(1).max(100).optional(),
  det_free_thr: z.int().min(1).max(100).optional(),
  act_free_thr: z.int().min(1).max(1000).optional(),
  stat_free_thr: z.int().min(1).max(1000).optional(),
  sleep_free_thr: z.int().min(1).max(65535).optional(),
});
export const SHELLY_SENSOR_CONFIG = z.object({
  flipped: z.boolean().optional(),
  height: z.number().min(0).max(5).optional(),
  tilt: z.number().optional(),
  points: z.number().min(10).max(100).optional(),
  velocity: z.number().min(0.01).max(1).optional(),
  snr: z.number().min(10).max(100).optional(),
  max_velocity: z.number().min(1).max(50).optional(),
  position: z.enum(['left', 'center', 'right']).optional(),
  power: SENSOR_LEVEL.optional(),
  sensitivity: z.union([SENSOR_LEVEL, z.literal('custom')]).optional(),
  room_preset: z.enum(['default', 'small_room']).optional(),
  state: SHELLY_SENSOR_STATE.optional(),
});
export const SHELLY_NIGHT_CONFIG = z.object({
  enable: z.boolean().optional(),
  brightness: z.number().min(0).max(100).optional(),
  active_between: SHELLY_TIME_WINDOW.optional(),
});
export const SHELLY_PRESENCE_CONFIG = z.object({
  enable: z.boolean(),
  num_tracks: z.int().min(1).max(10).optional(),
  zmin: z.number().min(0).max(2.9).nullable().optional(),
  zmax: z.number().min(0.1).max(5).nullable().optional(),
  sensor: SHELLY_SENSOR_CONFIG.optional(),
  ui: z.object({ imperial: z.boolean().optional() }).optional(),
  blind: SHELLY_AREA.optional(),
  leds: z
    .object({
      brightness: z.number().min(0).max(100).optional(),
      night_mode: SHELLY_NIGHT_CONFIG.optional(),
    })
    .optional(),
  main_zone: z.string().regex(/^presencezone:[0-9]+$/),
});
export const SHELLY_ZONE_CONFIG = z.object({
  id: SHELLY_COMPONENT_ID,
  name: SHELLY_NAME.optional(),
  enable: z.boolean(),
  color: SHELLY_RGB.optional(),
  presence_delay: z.number().min(0).max(3600).nullable().optional(),
  absence_delay: z.number().min(0).max(3600).nullable().optional(),
  presence_thr: z.number().min(0).max(3600).nullable().optional(),
  absence_thr: z.number().min(0).max(3600).nullable().optional(),
  area: SHELLY_AREA,
});
export const SHELLY_ZONE_STATUS = z.object({
  id: SHELLY_COMPONENT_ID,
  value: z.boolean().nullable(),
  num_objects: z.int().nonnegative().nullable(),
});
export const SHELLY_PRESENCE_STATUS = z.object({
  sensor_ver: z.string().max(100).optional(),
  live_track: z
    .object({
      timer_started_at: z.number().nonnegative(),
      timer_duration: z.number().positive(),
      interval: z.number().positive(),
    })
    .nullable()
    .optional(),
  errors: SHELLY_ERRORS.optional(),
});
export const SHELLY_LIGHT_CONFIG = z.object({
  id: SHELLY_COMPONENT_ID,
  name: SHELLY_NAME.optional(),
  dark_thr: z.number().nonnegative().optional(),
  bright_thr: z.number().nonnegative().optional(),
});
export const SHELLY_LIGHT_STATUS = z.object({
  id: SHELLY_COMPONENT_ID,
  lux: z.number().nonnegative().nullable().optional(),
  illumination: z.enum(['dark', 'twilight', 'bright']).nullable(),
  errors: SHELLY_ERRORS.optional(),
});
export type ShellyPresenceConfig = z.output<typeof SHELLY_PRESENCE_CONFIG>;
export type ShellyZoneConfig = z.output<typeof SHELLY_ZONE_CONFIG>;
