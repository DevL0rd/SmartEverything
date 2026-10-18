import { JSON_VALUE } from '@smarteverything/domain';
import { z } from 'zod';
import { SHELLY_COMPONENT_ID, SHELLY_REVISION } from './primitives';

const CALL = z.looseObject({ method: z.string(), params: JSON_VALUE.optional() });

export const SHELLY_SCHEDULE_ROW = z.looseObject({
  id: SHELLY_COMPONENT_ID,
  enable: z.boolean(),
  timespec: z.string(),
  calls: z.array(CALL),
});
export const SHELLY_SCHEDULES = z.looseObject({
  jobs: z.array(SHELLY_SCHEDULE_ROW),
  rev: SHELLY_REVISION.optional(),
});

export const SHELLY_WEBHOOK_ROW = z.looseObject({
  id: SHELLY_COMPONENT_ID,
  event: z.string(),
  cid: SHELLY_COMPONENT_ID,
  urls: z.array(z.string()),
});
export const SHELLY_WEBHOOKS = z.looseObject({
  hooks: z.array(SHELLY_WEBHOOK_ROW),
  rev: SHELLY_REVISION.optional(),
});
export const SHELLY_WEBHOOK_TYPES = z.looseObject({
  types: z.array(
    z.record(
      z.string(),
      z.looseObject({
        attrs: z
          .array(
            z.looseObject({
              name: z.string(),
              type: z.string(),
              desc: z.string().optional(),
            }),
          )
          .optional(),
      }),
    ),
  ),
  offset: z.int().nonnegative().optional(),
  total: z.int().nonnegative().optional(),
});

export const SHELLY_SCRIPT = z.looseObject({
  id: SHELLY_COMPONENT_ID,
  name: z.string().nullable().optional(),
  enable: z.boolean().optional(),
  running: z.boolean().optional(),
  status: z
    .looseObject({
      id: SHELLY_COMPONENT_ID,
      running: z.boolean(),
      errors: z.array(z.string()).optional(),
    })
    .optional(),
});
export const SHELLY_SCRIPTS = z.looseObject({ scripts: z.array(SHELLY_SCRIPT) });

const KVS_ENTRY = z.looseObject({ etag: z.string(), value: JSON_VALUE });
export const SHELLY_KVS_PAGE = z
  .looseObject({
    items: z.union([
      z.record(z.string(), KVS_ENTRY),
      z
        .array(KVS_ENTRY.extend({ key: z.string() }))
        .transform((entries) =>
          Object.fromEntries(entries.map(({ key, etag, value }) => [key, { etag, value }])),
        ),
    ]),
    offset: z.int().nonnegative().optional(),
    total: z.int().nonnegative().optional(),
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
export type ShellyResources = z.output<typeof SHELLY_RESOURCES>;
