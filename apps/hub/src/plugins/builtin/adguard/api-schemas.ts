import { z } from 'zod';

const TOP_LIST = z.array(z.record(z.string(), z.number())).default([]);

export const STATUS_REPLY = z.object({
  version: z.string().default(''),
  running: z.boolean().default(true),
  protection_enabled: z.boolean(),
  protection_disabled_until: z.string().nullable().optional(),
  protection_disabled_duration: z.number().nonnegative().optional(),
});

export type StatusReply = z.output<typeof STATUS_REPLY>;

export const STATS_REPLY = z.object({
  num_dns_queries: z.number().int().nonnegative(),
  num_blocked_filtering: z.number().int().nonnegative(),
  num_replaced_safebrowsing: z.number().int().nonnegative().default(0),
  num_replaced_parental: z.number().int().nonnegative().default(0),
  avg_processing_time: z.number().nonnegative(),
  top_queried_domains: TOP_LIST,
  top_blocked_domains: TOP_LIST,
  top_clients: TOP_LIST,
  dns_queries: z.array(z.number().nonnegative()).default([]),
  blocked_filtering: z.array(z.number().nonnegative()).default([]),
  time_units: z.enum(['hours', 'days']).default('hours'),
});

export type StatsReply = z.output<typeof STATS_REPLY>;

const FILTER_REPLY = z.object({
  id: z.number().int(),
  name: z.string().default(''),
  url: z.string(),
  enabled: z.boolean(),
  rules_count: z.number().int().nonnegative().default(0),
  last_updated: z.string().nullable().optional(),
});

export const FILTERING_REPLY = z.object({
  filters: z.array(FILTER_REPLY).nullable().default([]),
  whitelist_filters: z.array(FILTER_REPLY).nullable().default([]),
  user_rules: z.array(z.string()).nullable().default([]),
});

export type FilteringReply = z.output<typeof FILTERING_REPLY>;

const QUERY_ROW = z.object({
  time: z.string(),
  question: z.object({
    name: z.string(),
    type: z.string().default(''),
    unicode_name: z.string().optional(),
  }),
  client: z.string().default(''),
  client_info: z
    .object({ name: z.string().default('') })
    .nullable()
    .optional(),
  reason: z.string().default(''),
  rules: z
    .array(z.object({ text: z.string() }))
    .nullable()
    .optional(),
  elapsedMs: z.union([z.string(), z.number()]).optional(),
  upstream: z.string().optional(),
  cached: z.boolean().default(false),
});

export type QueryRow = z.output<typeof QUERY_ROW>;

export const QUERY_LOG_REPLY = z.object({
  data: z.array(QUERY_ROW).nullable().default([]),
  oldest: z.string().default(''),
});

const CONFIGURED_CLIENT = z.object({
  name: z.string(),
  ids: z.array(z.string()).default([]),
  use_global_settings: z.boolean().default(true),
  filtering_enabled: z.boolean().optional(),
  blocked_services: z.array(z.string()).nullable().optional(),
});

const DETECTED_CLIENT = z.object({ ip: z.string(), name: z.string().default('') });

export const CLIENTS_REPLY = z.object({
  clients: z.array(CONFIGURED_CLIENT).nullable().default([]),
  auto_clients: z.array(DETECTED_CLIENT).nullable().default([]),
});

export type ClientsReply = z.output<typeof CLIENTS_REPLY>;
