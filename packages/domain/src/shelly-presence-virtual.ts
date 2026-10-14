import { z } from 'zod';
import {
  SHELLY_COMPONENT_ID,
  SHELLY_COMPONENT_KEY,
  SHELLY_NAME,
} from './shelly-presence-primitives';

const TITLES = z.union([
  z.array(z.string().max(100)).max(100),
  z.record(z.string().max(100), z.string().max(100)),
]);
export const SHELLY_COMPONENT_META = z
  .object({
    ui: z
      .object({
        name: z.string().max(64).nullable().optional(),
        step: z.number().positive().optional(),
        view: z.string().max(100).optional(),
        titles: TITLES.optional(),
        unit: z.string().max(30).optional(),
        icon: z.string().max(500).nullable().optional(),
        buttonIcons: z.array(z.string().max(500)).max(20).optional(),
        images: z.record(z.string().max(100), z.string().max(500)).optional(),
        visible: z.boolean().optional(),
        order: z.int().optional(),
      })
      .optional(),
  })
  .nullable();
const BASE = {
  id: SHELLY_COMPONENT_ID,
  name: SHELLY_NAME.optional(),
  meta: SHELLY_COMPONENT_META.optional(),
};
const PERSISTED = { ...BASE, persisted: z.boolean().optional() };
export const SHELLY_BOOLEAN_CONFIG = z.object({
  ...PERSISTED,
  default_value: z.boolean().nullable().optional(),
});
export const SHELLY_NUMBER_CONFIG = z.object({
  ...PERSISTED,
  default_value: z.number().nullable().optional(),
  min: z.number().nullable().optional(),
  max: z.number().nullable().optional(),
});
export const SHELLY_ENUM_CONFIG = z.object({
  ...PERSISTED,
  default_value: z.string().nullable().optional(),
  options: z.array(z.string().max(100)).max(100),
});
export const SHELLY_TEXT_CONFIG = z.object({
  ...PERSISTED,
  default_value: z.string().nullable().optional(),
  max_len: z.int().positive().optional(),
});
export const SHELLY_BUTTON_CONFIG = z.object(BASE);
export const SHELLY_GROUP_CONFIG = z.object(BASE);
const STATUS = {
  id: SHELLY_COMPONENT_ID.optional(),
  source: z.string().max(100).optional(),
  last_update_ts: z.number().nullable().optional(),
};
export const SHELLY_VIRTUAL_COMPONENT = z.discriminatedUnion('component', [
  z.object({
    component: z.literal('boolean'),
    key: SHELLY_COMPONENT_KEY,
    config: SHELLY_BOOLEAN_CONFIG,
    status: z.object({ ...STATUS, value: z.boolean().nullable() }).nullable(),
  }),
  z.object({
    component: z.literal('number'),
    key: SHELLY_COMPONENT_KEY,
    config: SHELLY_NUMBER_CONFIG,
    status: z.object({ ...STATUS, value: z.number().nullable() }).nullable(),
  }),
  z.object({
    component: z.literal('enum'),
    key: SHELLY_COMPONENT_KEY,
    config: SHELLY_ENUM_CONFIG,
    status: z.object({ ...STATUS, value: z.string().nullable() }).nullable(),
  }),
  z.object({
    component: z.literal('text'),
    key: SHELLY_COMPONENT_KEY,
    config: SHELLY_TEXT_CONFIG,
    status: z.object({ ...STATUS, value: z.string().nullable() }).nullable(),
  }),
  z.object({
    component: z.literal('button'),
    key: SHELLY_COMPONENT_KEY,
    config: SHELLY_BUTTON_CONFIG,
    status: z.object({ id: SHELLY_COMPONENT_ID.optional() }).nullable(),
  }),
  z.object({
    component: z.literal('group'),
    key: SHELLY_COMPONENT_KEY,
    config: SHELLY_GROUP_CONFIG,
    status: z.object({ ...STATUS, value: z.array(SHELLY_COMPONENT_KEY).max(100) }).nullable(),
  }),
]);
export const SHELLY_VIRTUAL_CONFIG = z.discriminatedUnion('component', [
  z.strictObject({
    component: z.literal('boolean'),
    value: SHELLY_BOOLEAN_CONFIG.omit({ id: true })
      .strict()
      .extend({ default_value: z.boolean().optional() }),
  }),
  z.strictObject({
    component: z.literal('number'),
    value: SHELLY_NUMBER_CONFIG.omit({ id: true })
      .strict()
      .extend({ default_value: z.number().optional() }),
  }),
  z.strictObject({
    component: z.literal('enum'),
    value: SHELLY_ENUM_CONFIG.omit({ id: true }).partial().strict(),
  }),
  z.strictObject({
    component: z.literal('text'),
    value: SHELLY_TEXT_CONFIG.omit({ id: true }).strict(),
  }),
  z.strictObject({
    component: z.literal('button'),
    value: SHELLY_BUTTON_CONFIG.omit({ id: true }).strict(),
  }),
  z.strictObject({
    component: z.literal('group'),
    value: SHELLY_GROUP_CONFIG.omit({ id: true }).strict(),
  }),
]);
export const SHELLY_VIRTUAL_VALUE = z.discriminatedUnion('component', [
  z.strictObject({ component: z.literal('boolean'), value: z.boolean() }),
  z.strictObject({ component: z.literal('number'), value: z.number() }),
  z.strictObject({ component: z.literal('enum'), value: z.string().nullable() }),
  z.strictObject({ component: z.literal('text'), value: z.string() }),
  z.strictObject({ component: z.literal('group'), value: z.array(SHELLY_COMPONENT_KEY).max(100) }),
]);
export type ShellyVirtualComponent = z.output<typeof SHELLY_VIRTUAL_COMPONENT>;
