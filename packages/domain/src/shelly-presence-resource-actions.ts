import { z } from 'zod';
import { SHELLY_COMPONENT_ID, SHELLY_REVISION } from './shelly-presence-primitives';
import {
  SHELLY_SCHEDULE_INPUT,
  SHELLY_WEBHOOK_INPUT,
  SHELLY_SCRIPT_CONFIG,
  SHELLY_STORED_KEY,
  SHELLY_STORED_VALUE,
} from './shelly-presence-resources';

const REVISION = { expectedRevision: SHELLY_REVISION.optional() };
export const SHELLY_RESOURCE_ACTIONS = [
  z.strictObject({
    action: z.literal('schedule_create'),
    schedule: SHELLY_SCHEDULE_INPUT,
    ...REVISION,
  }),
  z.strictObject({
    action: z.literal('schedule_update'),
    id: SHELLY_COMPONENT_ID,
    schedule: SHELLY_SCHEDULE_INPUT.partial(),
    ...REVISION,
  }),
  z.strictObject({ action: z.literal('schedule_delete'), id: SHELLY_COMPONENT_ID, ...REVISION }),
  z.strictObject({ action: z.literal('schedule_delete_all'), ...REVISION }),
  z.strictObject({
    action: z.literal('schedule_eval'),
    timespec: z.string().min(1).max(300),
    now: z.number().nonnegative().optional(),
  }),
  z.strictObject({
    action: z.literal('webhook_create'),
    webhook: SHELLY_WEBHOOK_INPUT,
    ...REVISION,
  }),
  z.strictObject({
    action: z.literal('webhook_update'),
    id: SHELLY_COMPONENT_ID,
    webhook: SHELLY_WEBHOOK_INPUT.partial(),
    ...REVISION,
  }),
  z.strictObject({ action: z.literal('webhook_delete'), id: SHELLY_COMPONENT_ID, ...REVISION }),
  z.strictObject({ action: z.literal('webhook_delete_all'), ...REVISION }),
  z.strictObject({ action: z.literal('script_create'), name: z.string().min(1).max(64) }),
  z.strictObject({
    action: z.literal('script_config'),
    id: SHELLY_COMPONENT_ID,
    config: SHELLY_SCRIPT_CONFIG.omit({ id: true }).strict(),
    ...REVISION,
  }),
  z.strictObject({
    action: z.literal('script_put_code'),
    id: SHELLY_COMPONENT_ID,
    code: z.string().min(1).max(65536),
    append: z.boolean().default(false),
  }),
  z.strictObject({ action: z.literal('script_start'), id: SHELLY_COMPONENT_ID }),
  z.strictObject({ action: z.literal('script_stop'), id: SHELLY_COMPONENT_ID }),
  z.strictObject({ action: z.literal('script_delete'), id: SHELLY_COMPONENT_ID }),
  z.strictObject({
    action: z.literal('script_eval'),
    id: SHELLY_COMPONENT_ID,
    code: z.string().min(1).max(4096),
  }),
  z.strictObject({ action: z.literal('script_code'), id: SHELLY_COMPONENT_ID }),
  z.strictObject({
    action: z.literal('kvs_set'),
    key: SHELLY_STORED_KEY,
    value: SHELLY_STORED_VALUE,
    etag: z.string().min(1).max(100).optional(),
  }),
  z.strictObject({
    action: z.literal('kvs_delete'),
    key: SHELLY_STORED_KEY,
    etag: z.string().min(1).max(100).optional(),
  }),
] as const;
