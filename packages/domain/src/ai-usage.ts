import { z } from 'zod';
import { JSON_VALUE } from './values';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });
const COUNT = z.int().min(0);
const KEY = z.string().trim().min(1).max(200);

export const MICROS_PER_USD = 1_000_000;

export const USAGE_SOURCES = ['openrouter', 'gemini', 'gemini_live', 'claude', 'codex'] as const;

export type UsageSource = (typeof USAGE_SOURCES)[number];

export const USAGE_SOURCE = z.enum(USAGE_SOURCES);

export const USAGE_SOURCE_LABELS: Readonly<Record<UsageSource, string>> = {
  openrouter: 'OpenRouter',
  gemini: 'Gemini',
  gemini_live: 'Gemini Live',
  claude: 'Claude',
  codex: 'Codex',
};

export const PLAN_SOURCES: ReadonlySet<UsageSource> = new Set(['claude', 'codex']);

export const USAGE_WORKS = [
  'chat',
  'voice',
  'subagent',
  'wake',
  'routine',
  'image',
  'video',
  'transcribe',
  'embed',
  'worker',
] as const;

export type UsageWork = (typeof USAGE_WORKS)[number];

export const USAGE_WORK = z.enum(USAGE_WORKS);

export const USAGE_WORK_LABELS: Readonly<Record<UsageWork, string>> = {
  chat: 'Chat',
  voice: 'Voice',
  subagent: 'Helpers',
  wake: 'Wake-ups',
  routine: 'Routines',
  image: 'Images',
  video: 'Video',
  transcribe: 'Transcripts',
  embed: 'Search index',
  worker: 'Claude and Codex',
};

export const COST_STATES = ['estimated', 'reported', 'reconciled', 'plan'] as const;

export type CostState = (typeof COST_STATES)[number];

export const COST_STATE = z.enum(COST_STATES);

export const USAGE_METER = {
  tokens_in: COUNT,
  tokens_out: COUNT,
  tokens_cached: COUNT,
  tokens_reasoning: COUNT,
  audio_in_ms: COUNT,
  audio_out_ms: COUNT,
  images: COUNT,
  video_ms: COUNT,
};

export const USAGE_METER_FIELDS = [
  'tokens_in',
  'tokens_out',
  'tokens_cached',
  'tokens_reasoning',
  'audio_in_ms',
  'audio_out_ms',
  'images',
  'video_ms',
] as const;

export type UsageMeterField = (typeof USAGE_METER_FIELDS)[number];

const USAGE_LINKS = {
  profile_id: ID,
  client_id: ID.nullable(),
  chat_id: ID.nullable(),
  message_id: ID.nullable(),
  call_id: ID.nullable(),
  plugin_id: KEY.nullable(),
  worker_id: ID.nullable(),
  source: USAGE_SOURCE,
  work: USAGE_WORK,
  model_id: KEY.nullable(),
  generation_id: KEY.nullable(),
};

function planIsFree(row: {
  source: UsageSource;
  cost_state: CostState;
  cost_micros: number;
}): boolean {
  const plan = PLAN_SOURCES.has(row.source);
  return plan ? row.cost_state === 'plan' && row.cost_micros === 0 : row.cost_state !== 'plan';
}

const PLAN_RULE = {
  message:
    'Claude and Codex usage is on a plan (cost 0, state plan); every other source has a price',
};

export const AI_USAGE_ROW = z
  .strictObject({
    id: ID,
    at: MOMENT,
    ...USAGE_LINKS,
    ...USAGE_METER,
    cost_micros: COUNT,
    cost_state: COST_STATE,
    meta: z.record(z.string(), JSON_VALUE),
  })
  .refine(planIsFree, PLAN_RULE);

export type AiUsageRow = z.output<typeof AI_USAGE_ROW>;

export const USAGE_ENTRY = z
  .strictObject({
    at: MOMENT.optional(),
    ...USAGE_LINKS,
    client_id: USAGE_LINKS.client_id.default(null),
    chat_id: USAGE_LINKS.chat_id.default(null),
    message_id: USAGE_LINKS.message_id.default(null),
    call_id: USAGE_LINKS.call_id.default(null),
    plugin_id: USAGE_LINKS.plugin_id.default(null),
    worker_id: USAGE_LINKS.worker_id.default(null),
    model_id: USAGE_LINKS.model_id.default(null),
    generation_id: USAGE_LINKS.generation_id.default(null),
    tokens_in: COUNT.default(0),
    tokens_out: COUNT.default(0),
    tokens_cached: COUNT.default(0),
    tokens_reasoning: COUNT.default(0),
    audio_in_ms: COUNT.default(0),
    audio_out_ms: COUNT.default(0),
    images: COUNT.default(0),
    video_ms: COUNT.default(0),
    cost_micros: COUNT,
    cost_state: COST_STATE,
    meta: z.record(z.string(), JSON_VALUE).default({}),
  })
  .refine(planIsFree, PLAN_RULE);

export type UsageEntry = z.input<typeof USAGE_ENTRY>;

export const USAGE_RECONCILE = z.strictObject({
  cost_micros: COUNT,
  tokens_in: COUNT.optional(),
  tokens_out: COUNT.optional(),
  tokens_cached: COUNT.optional(),
  tokens_reasoning: COUNT.optional(),
  meta: z.record(z.string(), JSON_VALUE).optional(),
});

export type UsageReconcile = z.input<typeof USAGE_RECONCILE>;

export const USAGE_BUCKETS = ['hour', 'day', 'week', 'month'] as const;

export type UsageBucket = (typeof USAGE_BUCKETS)[number];

export const USAGE_BUCKET = z.enum(USAGE_BUCKETS);

export const USAGE_SPLITS = [
  'work',
  'source',
  'model',
  'profile',
  'client',
  'chat',
  'plugin',
] as const;

export type UsageSplit = (typeof USAGE_SPLITS)[number];

export const USAGE_SPLIT = z.enum(USAGE_SPLITS);

export const USAGE_FILTER = z
  .strictObject({
    from: MOMENT,
    to: MOMENT,
    profileIds: z.array(ID).min(1).optional(),
    clientIds: z.array(ID).min(1).optional(),
    works: z.array(USAGE_WORK).min(1).optional(),
    sources: z.array(USAGE_SOURCE).min(1).optional(),
    modelIds: z.array(KEY).min(1).optional(),
    chatId: ID.optional(),
    messageId: ID.optional(),
    pluginId: KEY.optional(),
  })
  .refine((filter) => Date.parse(filter.from) < Date.parse(filter.to), {
    message: 'from must be before to',
  });

export type UsageFilter = z.output<typeof USAGE_FILTER>;

export const USAGE_SUM = z.strictObject({
  ...USAGE_METER,
  count: COUNT,
  cost_micros: COUNT,
  pending_micros: COUNT,
});

export type UsageSum = z.output<typeof USAGE_SUM>;

export const USAGE_PART = z.strictObject({
  key: KEY,
  label: z.string().min(1).max(200).optional(),
  count: COUNT,
  cost_micros: COUNT,
});

export type UsagePart = z.output<typeof USAGE_PART>;

export const USAGE_BREAKDOWN_LIMIT = 20;

export const USAGE_TOTALS = z.strictObject({
  from: MOMENT,
  to: MOMENT,
  sum: USAGE_SUM,
  by: z.strictObject({
    work: z.array(USAGE_PART),
    source: z.array(USAGE_PART),
    model: z.array(USAGE_PART),
    profile: z.array(USAGE_PART),
    client: z.array(USAGE_PART),
    chat: z.array(USAGE_PART),
    plugin: z.array(USAGE_PART),
  }),
});

export type UsageTotals = z.output<typeof USAGE_TOTALS>;

export const USAGE_POINT = z.strictObject({
  start: MOMENT,
  end: MOMENT,
  count: COUNT,
  cost_micros: COUNT,
  parts: z.array(USAGE_PART),
});

export type UsagePoint = z.output<typeof USAGE_POINT>;

export const USAGE_SERIES = z.strictObject({
  from: MOMENT,
  to: MOMENT,
  bucket: USAGE_BUCKET,
  split: USAGE_SPLIT.nullable(),
  time_zone: z.string().min(1),
  points: z.array(USAGE_POINT),
});

export type UsageSeries = z.output<typeof USAGE_SERIES>;

export const USAGE_SERIES_POINTS_MAX = 800;

export const USAGE_CHOICES = z.strictObject({
  profile: z.array(USAGE_PART),
  client: z.array(USAGE_PART),
  work: z.array(USAGE_PART),
  source: z.array(USAGE_PART),
  model: z.array(USAGE_PART),
  chat: z.array(USAGE_PART),
  plugin: z.array(USAGE_PART),
});

export type UsageChoices = z.output<typeof USAGE_CHOICES>;

export const USAGE_CHOICES_LIMIT = 50;

export const USAGE_LEDGER_LIMIT = 60;

const NAMED = z.strictObject({ id: KEY, label: z.string().min(1).max(200) });

export type UsageNamed = z.output<typeof NAMED>;

export const USAGE_LEDGER_ROW = z.strictObject({
  id: ID,
  at: MOMENT,
  work: USAGE_WORK,
  source: USAGE_SOURCE,
  cost_micros: COUNT,
  cost_state: COST_STATE,
  tokens_in: COUNT,
  tokens_out: COUNT,
  tokens_reasoning: COUNT,
  audio_in_ms: COUNT,
  audio_out_ms: COUNT,
  images: COUNT,
  video_ms: COUNT,
  profile: NAMED,
  client: NAMED.nullable(),
  chat: NAMED.nullable(),
  model: NAMED.nullable(),
  plugin: NAMED.nullable(),
});

export type UsageLedgerRow = z.output<typeof USAGE_LEDGER_ROW>;

export const USAGE_CURSOR = z
  .string()
  .regex(/^[A-Za-z0-9_-]{8,200}$/, 'a cursor from the previous page');

export const USAGE_LEDGER_PAGE = z.strictObject({
  rows: z.array(USAGE_LEDGER_ROW),
  next_cursor: USAGE_CURSOR.nullable(),
});

export type UsageLedgerPage = z.output<typeof USAGE_LEDGER_PAGE>;

export function usdOfMicros(micros: number): number {
  return micros / MICROS_PER_USD;
}

export function microsOfUsd(usd: number): number {
  return Math.round(usd * MICROS_PER_USD);
}
