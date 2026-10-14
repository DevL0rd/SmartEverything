import { z } from 'zod';
import { JSON_VALUE } from './values';
import {
  SHELLY_COMPONENT_ID,
  SHELLY_NAME,
  SHELLY_REVISION,
  SHELLY_TIME_WINDOW,
  SHELLY_TLS_CA,
} from './shelly-presence-primitives';
import {
  SHELLY_LIGHT_PATCH,
  SHELLY_PRESENCE_PATCH,
  SHELLY_ZONE_PATCH,
} from './shelly-presence-actions-core';
import { SHELLY_MQTT_PATCH, SHELLY_WIFI_PATCH } from './shelly-presence-network';
import { SHELLY_SYS_PATCH } from './shelly-presence-system';

export const SHELLY_SCHEDULE_CALL = z.discriminatedUnion('method', [
  z.strictObject({
    method: z.literal('Presence.SetSensor'),
    params: z.strictObject({ enable: z.boolean() }),
  }),
  z.strictObject({
    method: z.literal('Presence.SetConfig'),
    params: z.strictObject({ config: SHELLY_PRESENCE_PATCH }),
  }),
  z.strictObject({
    method: z.literal('PresenceZone.SetConfig'),
    params: z.strictObject({ id: SHELLY_COMPONENT_ID, config: SHELLY_ZONE_PATCH }),
  }),
  z.strictObject({
    method: z.literal('Illuminance.SetConfig'),
    params: z.strictObject({ id: SHELLY_COMPONENT_ID, config: SHELLY_LIGHT_PATCH }),
  }),
  z.strictObject({
    method: z.literal('WiFi.SetConfig'),
    params: z.strictObject({ config: SHELLY_WIFI_PATCH }),
  }),
  z.strictObject({
    method: z.literal('MQTT.SetConfig'),
    params: z.strictObject({ config: SHELLY_MQTT_PATCH }),
  }),
  z.strictObject({
    method: z.literal('Sys.SetConfig'),
    params: z.strictObject({ config: SHELLY_SYS_PATCH }),
  }),
  z.strictObject({
    method: z.literal('Shelly.Reboot'),
    params: z.strictObject({ delay_ms: z.int().nonnegative().optional() }),
  }),
  z.strictObject({
    method: z.literal('Script.Start'),
    params: z.strictObject({ id: SHELLY_COMPONENT_ID }),
  }),
  z.strictObject({
    method: z.literal('Script.Stop'),
    params: z.strictObject({ id: SHELLY_COMPONENT_ID }),
  }),
]);
export const SHELLY_SCHEDULE_INPUT = z.strictObject({
  enable: z.boolean().optional(),
  timespec: z.string().min(1).max(300),
  calls: z.array(SHELLY_SCHEDULE_CALL).min(1).max(20),
});
const SCHEDULE_READ_CALL = z.object({
  method: z.string().min(1).max(100),
  params: JSON_VALUE.optional(),
});
export const SHELLY_SCHEDULE_ROW = z
  .object({
    id: SHELLY_COMPONENT_ID,
    enable: z.boolean(),
    timespec: z.string().max(300),
    calls: z.array(SCHEDULE_READ_CALL).max(20),
    unavailableCalls: z.array(z.string().min(1).max(100)).max(20).default([]),
  })
  .transform((row) => {
    const calls: ShellyScheduleCall[] = [];
    const unavailableCalls = [...row.unavailableCalls];
    for (const call of row.calls) {
      const parsed = SHELLY_SCHEDULE_CALL.safeParse(call);
      if (
        !parsed.success ||
        /"(?:pass|password|key|token|ha1)"\s*:/i.test(JSON.stringify(call.params))
      ) {
        unavailableCalls.push(call.method);
        continue;
      }
      calls.push(parsed.data);
    }
    return { ...row, calls, unavailableCalls };
  });
export const SHELLY_SCHEDULES = z.object({
  jobs: z.array(SHELLY_SCHEDULE_ROW).max(20),
  rev: SHELLY_REVISION.optional(),
});
export const SHELLY_WEBHOOK_INPUT = z.strictObject({
  event: z.string().min(1).max(100),
  cid: SHELLY_COMPONENT_ID,
  enable: z.boolean().optional(),
  name: SHELLY_NAME.optional(),
  ssl_ca: SHELLY_TLS_CA.optional(),
  urls: z
    .array(z.url({ protocol: /^https?$/ }).max(300))
    .min(1)
    .max(5),
  active_between: SHELLY_TIME_WINDOW.nullable().optional(),
  condition: z.string().max(2000).nullable().optional(),
  repeat_period: z.number().optional(),
});
export const SHELLY_WEBHOOK_ROW = SHELLY_WEBHOOK_INPUT.extend({
  id: SHELLY_COMPONENT_ID,
  destinationsRedacted: z.boolean().default(false),
}).transform((row) => {
  let destinationsRedacted = row.destinationsRedacted;
  const urls = row.urls.map((value) => {
    const url = new URL(value);
    if (
      url.username.length === 0 &&
      url.password.length === 0 &&
      url.search.length === 0 &&
      url.hash.length === 0
    )
      return value;
    destinationsRedacted = true;
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.href;
  });
  return { ...row, urls, destinationsRedacted };
});
export const SHELLY_WEBHOOKS = z.object({
  hooks: z.array(SHELLY_WEBHOOK_ROW).max(64),
  rev: SHELLY_REVISION.optional(),
});
export const SHELLY_WEBHOOK_ATTRIBUTES = z
  .array(
    z.object({
      name: z.string().max(100),
      type: z.enum(['boolean', 'number', 'string']),
      desc: z.string().max(500).optional(),
    }),
  )
  .max(64);
export const SHELLY_WEBHOOK_TYPES = z.object({
  types: z
    .array(z.record(z.string().max(100), z.object({ attrs: SHELLY_WEBHOOK_ATTRIBUTES.optional() })))
    .max(256),
  offset: z.int().nonnegative().optional(),
  total: z.int().nonnegative().optional(),
});
export const SHELLY_SCRIPT_CONFIG = z.object({
  id: SHELLY_COMPONENT_ID,
  name: SHELLY_NAME.optional(),
  enable: z.boolean().optional(),
});
export const SHELLY_SCRIPT_STATUS = z.object({
  id: SHELLY_COMPONENT_ID,
  running: z.boolean(),
  errors: z.array(z.string().max(100)).max(32).optional(),
  mem_used: z.number().optional(),
  mem_peak: z.number().optional(),
  mem_free: z.number().optional(),
  cpu: z.number().optional(),
});
export const SHELLY_SCRIPTS = z.object({
  scripts: z
    .array(
      SHELLY_SCRIPT_CONFIG.extend({
        running: z.boolean().optional(),
        status: SHELLY_SCRIPT_STATUS.optional(),
      }),
    )
    .max(10),
});
export const SHELLY_STORED_KEY = z.string().min(1).max(42);
export const SHELLY_STORED_VALUE = JSON_VALUE.refine(
  (value) => new TextEncoder().encode(JSON.stringify(value)).length <= 253,
  'A stored value must fit 253 UTF-8 bytes',
);
export const SHELLY_KVS_ENTRY = z.object({
  etag: z.string().min(1).max(100),
  value: SHELLY_STORED_VALUE,
});
export const SHELLY_KVS_PAGE = z
  .object({
    items: z.union([
      z.record(SHELLY_STORED_KEY, SHELLY_KVS_ENTRY),
      z
        .array(SHELLY_KVS_ENTRY.extend({ key: SHELLY_STORED_KEY }))
        .max(50)
        .transform((entries) =>
          Object.fromEntries(entries.map(({ key, etag, value }) => [key, { etag, value }])),
        ),
    ]),
    offset: z.int().nonnegative().optional(),
    total: z.int().min(0).max(50).optional(),
    rev: SHELLY_REVISION.optional(),
  })
  .transform((page) => ({
    ...page,
    offset: page.offset ?? 0,
    total: page.total ?? Object.keys(page.items).length,
  }));
export const SHELLY_RESOURCES = z.object({
  schedules: SHELLY_SCHEDULES.optional(),
  webhooks: SHELLY_WEBHOOKS.optional(),
  webhookTypes: SHELLY_WEBHOOK_TYPES.optional(),
  scripts: SHELLY_SCRIPTS.optional(),
  storedValues: SHELLY_KVS_PAGE.optional(),
});
export type ShellyScheduleCall = z.output<typeof SHELLY_SCHEDULE_CALL>;
export type ShellyResources = z.output<typeof SHELLY_RESOURCES>;
