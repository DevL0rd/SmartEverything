import { z } from 'zod';
import {
  SHELLY_COMPONENT_ID,
  SHELLY_COMPONENT_KEY,
  SHELLY_REVISION,
} from './shelly-presence-primitives';
import { SHELLY_VIRTUAL_CONFIG, SHELLY_VIRTUAL_VALUE } from './shelly-presence-virtual';
import { SHELLY_BTHOME_DEVICE_PATCH, SHELLY_BTHOME_SENSOR_PATCH } from './shelly-presence-bthome';

const REVISION = { expectedRevision: SHELLY_REVISION.optional() };
export const SHELLY_DYNAMIC_ACTIONS = [
  z.strictObject({
    action: z.literal('virtual_add'),
    config: SHELLY_VIRTUAL_CONFIG,
    id: z.int().min(200).max(299).optional(),
    ...REVISION,
  }),
  z.strictObject({ action: z.literal('virtual_delete'), key: SHELLY_COMPONENT_KEY, ...REVISION }),
  z.strictObject({
    action: z.literal('virtual_config'),
    id: SHELLY_COMPONENT_ID,
    config: SHELLY_VIRTUAL_CONFIG,
    ...REVISION,
  }),
  z.strictObject({
    action: z.literal('virtual_set'),
    id: SHELLY_COMPONENT_ID,
    setting: SHELLY_VIRTUAL_VALUE,
  }),
  z.strictObject({
    action: z.literal('virtual_button'),
    id: SHELLY_COMPONENT_ID,
    event: z.enum(['single_push', 'double_push', 'triple_push', 'long_push']),
  }),
  z.strictObject({
    action: z.literal('bthome_discover'),
    duration: z.number().positive().max(300).optional(),
  }),
  z.strictObject({
    action: z.literal('bthome_objects'),
    obj_ids: z.array(z.int().min(0).max(255)).max(256),
    offset: z.int().nonnegative().optional(),
  }),
  z.strictObject({
    action: z.literal('bthome_add_device'),
    config: SHELLY_BTHOME_DEVICE_PATCH.required({ addr: true }),
    id: z.int().min(200).max(299).optional(),
    ...REVISION,
  }),
  z.strictObject({
    action: z.literal('bthome_delete_device'),
    id: SHELLY_COMPONENT_ID,
    ...REVISION,
  }),
  z.strictObject({
    action: z.literal('bthome_device_config'),
    id: SHELLY_COMPONENT_ID,
    config: SHELLY_BTHOME_DEVICE_PATCH,
    ...REVISION,
  }),
  z.strictObject({ action: z.literal('bthome_known_objects'), id: SHELLY_COMPONENT_ID }),
  z.strictObject({
    action: z.literal('bthome_add_sensor'),
    config: SHELLY_BTHOME_SENSOR_PATCH.required({ addr: true, obj_id: true, idx: true }),
    id: z.int().min(200).max(299).optional(),
    ...REVISION,
  }),
  z.strictObject({
    action: z.literal('bthome_delete_sensor'),
    id: SHELLY_COMPONENT_ID,
    ...REVISION,
  }),
  z.strictObject({
    action: z.literal('bthome_sensor_config'),
    id: SHELLY_COMPONENT_ID,
    config: SHELLY_BTHOME_SENSOR_PATCH,
    ...REVISION,
  }),
  z.strictObject({ action: z.literal('bthome_reset_counter') }),
  z.strictObject({
    action: z.literal('bthome_set_config'),
    config: z.strictObject({ enable: z.boolean() }),
    ...REVISION,
  }),
  z.strictObject({ action: z.literal('sensor_restart') }),
] as const;
