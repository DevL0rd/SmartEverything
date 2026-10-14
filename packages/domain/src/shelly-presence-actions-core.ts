import { z } from 'zod';
import {
  SHELLY_LIGHT_CONFIG,
  SHELLY_PRESENCE_CONFIG,
  SHELLY_SENSOR_CONFIG,
  SHELLY_ZONE_CONFIG,
} from './shelly-presence-config';
const SENSOR_PATCH = SHELLY_SENSOR_CONFIG.strict()
  .extend({
    power: z.enum(['low', 'medium', 'high']).optional(),
    sensitivity: z.enum(['low', 'medium', 'high']).optional(),
  })
  .refine(
    (sensor) =>
      sensor.sensitivity === undefined ||
      [sensor.points, sensor.velocity, sensor.snr, sensor.max_velocity, sensor.state].every(
        (value) => value === undefined,
      ),
    'Sensitivity and custom tuning cannot be changed together',
  );
export const SHELLY_PRESENCE_PATCH = SHELLY_PRESENCE_CONFIG.omit({ main_zone: true })
  .partial()
  .strict()
  .extend({ sensor: SENSOR_PATCH.optional() })
  .refine(
    (config) =>
      config.zmin === undefined ||
      config.zmin === null ||
      config.zmax === undefined ||
      config.zmax === null ||
      config.zmin < config.zmax,
    'Minimum detection height must be below maximum',
  );
export const SHELLY_ZONE_PATCH = SHELLY_ZONE_CONFIG.omit({
  id: true,
  presence_thr: true,
  absence_thr: true,
})
  .partial()
  .strict();
export const SHELLY_ZONE_CREATE = SHELLY_ZONE_PATCH.required({
  name: true,
  enable: true,
  area: true,
});
export const SHELLY_LIGHT_PATCH = SHELLY_LIGHT_CONFIG.omit({ id: true })
  .partial()
  .strict()
  .refine(
    (config) =>
      config.dark_thr === undefined ||
      config.bright_thr === undefined ||
      config.dark_thr < config.bright_thr,
    'Dark threshold must be below bright threshold',
  );
