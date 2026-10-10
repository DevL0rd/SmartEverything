import { z } from 'zod';

export const BLOCKABLE_DOMAIN = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(
    /^(?:[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?\.)+[a-z0-9-]{2,63}$/,
    'a domain such as ads.example.com',
  );

const COUNT = z.number().int().nonnegative();

const MOMENT = z.iso.datetime({ offset: true });

const TOP_ENTRY = z.strictObject({ name: z.string(), count: COUNT });

export type AdGuardTopEntry = z.output<typeof TOP_ENTRY>;

const ADGUARD_STATUS = z.strictObject({
  version: z.string().nullable(),
  running: z.boolean(),
  protection: z.boolean(),
  pausedUntil: MOMENT.nullable(),
});

export type AdGuardStatus = z.output<typeof ADGUARD_STATUS>;

const ADGUARD_STATS = z.strictObject({
  queries: COUNT,
  blocked: COUNT,
  blockedPercent: z.number().min(0).max(100),
  averageMs: z.number().nonnegative(),
  malware: COUNT,
  adult: COUNT,
  topQueried: z.array(TOP_ENTRY),
  topBlocked: z.array(TOP_ENTRY),
  topClients: z.array(TOP_ENTRY),
  history: z.array(z.number().nonnegative()),
  historyBlocked: z.array(z.number().nonnegative()),
  timeUnit: z.enum(['hours', 'days']),
});

export type AdGuardStats = z.output<typeof ADGUARD_STATS>;

const ADGUARD_FILTER = z.strictObject({
  id: z.number().int(),
  name: z.string(),
  url: z.string(),
  enabled: z.boolean(),
  rules: COUNT,
  updatedAt: z.string().nullable(),
  allowList: z.boolean(),
});

export type AdGuardFilter = z.output<typeof ADGUARD_FILTER>;

const ADGUARD_CONNECTION = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('not_set_up') }),
  z.strictObject({ state: z.literal('sign_in_needed') }),
  z.strictObject({ state: z.literal('connecting') }),
  z.strictObject({ state: z.literal('online') }),
  z.strictObject({ state: z.literal('paused') }),
  z.strictObject({ state: z.literal('refused'), reason: z.string() }),
  z.strictObject({
    state: z.literal('unreachable'),
    reason: z.string(),
    since: MOMENT,
  }),
]);

export type AdGuardConnection = z.output<typeof ADGUARD_CONNECTION>;

export const ADGUARD_SNAPSHOT = z.strictObject({
  at: MOMENT,
  url: z.string().nullable(),
  connection: ADGUARD_CONNECTION,
  cadence: z.enum(['fast', 'slow', 'paused']),
  intervalSeconds: z.number().int().positive().nullable(),
  status: ADGUARD_STATUS.nullable(),
  stats: ADGUARD_STATS.nullable(),
  filters: z.array(ADGUARD_FILTER),
  userRules: z.array(z.string()),
});

export type AdGuardSnapshot = z.output<typeof ADGUARD_SNAPSHOT>;

const QUERY_OUTCOMES = ['blocked', 'allowed', 'rewritten'] as const;

const ADGUARD_QUERY = z.strictObject({
  time: MOMENT,
  domain: z.string(),
  type: z.string(),
  client: z.string(),
  clientName: z.string().nullable(),
  outcome: z.enum(QUERY_OUTCOMES),
  reason: z.string(),
  rule: z.string().nullable(),
  elapsedMs: z.number().nonnegative().nullable(),
  upstream: z.string().nullable(),
  cached: z.boolean(),
});

export type AdGuardQuery = z.output<typeof ADGUARD_QUERY>;

export const QUERY_LOG_FILTERS = ['all', 'blocked', 'allowed'] as const;

export type QueryLogFilter = (typeof QUERY_LOG_FILTERS)[number];

export const QUERY_LOG_REQUEST = z.strictObject({
  search: z.string().trim().max(200).default(''),
  filter: z.enum(QUERY_LOG_FILTERS).default('all'),
  olderThan: MOMENT.nullable().default(null),
  limit: z.number().int().min(1).max(100).default(50),
});

export type QueryLogRequest = z.output<typeof QUERY_LOG_REQUEST>;

export const QUERY_LOG_PAGE = z.strictObject({
  entries: z.array(ADGUARD_QUERY),
  olderThan: MOMENT.nullable(),
});

export type QueryLogPage = z.output<typeof QUERY_LOG_PAGE>;

export const ADGUARD_CLIENT_INFO = z.strictObject({
  query: z.string(),
  name: z.string().nullable(),
  ids: z.array(z.string()),
  source: z.enum(['configured', 'detected', 'unknown']),
  ownSettings: z.boolean(),
  filtering: z.boolean().nullable(),
  blockedServices: z.array(z.string()),
  queriesInStats: COUNT,
});

export type AdGuardClientInfo = z.output<typeof ADGUARD_CLIENT_INFO>;

export const PAUSE_MINUTES = z.number().int().min(1).max(1440);
