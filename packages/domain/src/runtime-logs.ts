import { z } from 'zod';
import { MOMENT } from './api/primitives';
import { JSON_OBJECT } from './api/primitives';

export const LOG_RUNTIMES = ['app', 'edge', 'db', 'tool', 'hub', 'desktop'] as const;

export const LOG_RUNTIME = z.enum(LOG_RUNTIMES);

export const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'exception'] as const;

export const LOG_LEVEL = z.enum(LOG_LEVELS);

export const LOG_PLATFORMS = ['android', 'ios', 'web', 'server'] as const;

export const LOG_PLATFORM = z.enum(LOG_PLATFORMS);

export const LOG_SCOPES = ['client', 'hub'] as const;

export const LOG_SCOPE = z.enum(LOG_SCOPES);

export const LOG_FAILURE = z.strictObject({
  name: z.string().min(1).max(120),
  message: z.string().min(1).max(2000),
  stack: z.string().min(1).max(20_000).optional(),
  cause: z
    .strictObject({
      name: z.string().min(1).max(120),
      message: z.string().min(1).max(2000),
      stack: z.string().min(1).max(20_000).optional(),
    })
    .optional(),
});

export const LOG_RECORD = z.strictObject({
  timestamp: MOMENT,
  runtime: LOG_RUNTIME,
  platform: LOG_PLATFORM,
  scope: z.string().min(1).max(120),
  event: z.string().min(1).max(120),
  level: LOG_LEVEL,
  payload: JSON_OBJECT.default({}),
  failure: LOG_FAILURE.optional(),
  durationMs: z.int().min(0).max(86_400_000).optional(),
  release: z.string().min(1).max(40).optional(),
  bundle: z.string().min(1).max(40).optional(),
  deviceId: z.string().min(1).max(80).optional(),
  actorId: z.string().min(1).max(120).optional(),
  correlationId: z.string().min(1).max(120).optional(),
  requestId: z.string().min(1).max(120).optional(),
});

export type RuntimeLogRecord = z.input<typeof LOG_RECORD>;

export const RUNTIME_LOG_BATCH_MAX = 2000;
export const RUNTIME_LOG_SEARCH_MAX = 200;

export const RUNTIME_LOG_BATCH = z.strictObject({
  dropped: z.int().min(0).default(0),
  records: z.array(LOG_RECORD).min(1).max(RUNTIME_LOG_BATCH_MAX),
  oldestSentAt: MOMENT.optional(),
});

export type RuntimeLogBatch = z.input<typeof RUNTIME_LOG_BATCH>;

export const NODE_LOG_BATCH_BYTES = 256 * 1024;

export const NODE_LOGS_FRAME = z.strictObject({
  type: z.literal('logs'),
  id: z.uuid(),
  batch: RUNTIME_LOG_BATCH,
});

export type NodeLogsFrame = z.output<typeof NODE_LOGS_FRAME>;

export const HUB_LOG_RECEIPT = z.strictObject({
  type: z.literal('log_receipt'),
  id: z.uuid(),
  stored: z.boolean(),
});

export type HubLogReceipt = z.output<typeof HUB_LOG_RECEIPT>;

export const RUNTIME_LOG_ROW = z.strictObject({
  id: z.int().min(1),
  at: MOMENT,
  source: z.string().min(1).max(80),
  runtime: LOG_RUNTIME,
  platform: LOG_PLATFORM,
  deviceId: z.string().min(1).nullable(),
  component: z.string().min(1).max(120),
  level: LOG_LEVEL,
  scope: z.string().min(1).max(120),
  event: z.string().min(1).max(120),
  payload: JSON_OBJECT,
  failure: LOG_FAILURE.nullable(),
  signature: z.string().min(1).max(64).nullable(),
  durationMs: z.int().min(0).nullable(),
  recordedAt: MOMENT,
  release: z.string().min(1).max(40).nullable(),
  bundle: z.string().min(1).max(40).nullable(),
});

export type RuntimeLogRow = z.output<typeof RUNTIME_LOG_ROW>;

export const RUNTIME_LOG_SOURCE = z.strictObject({
  source: z.string().min(1).max(80),
  runtime: LOG_RUNTIME,
  platform: LOG_PLATFORM,
  deviceId: z.string().min(1).nullable(),
  firstAt: MOMENT,
  lastAt: MOMENT,
  records: z.int().min(0),
  dropped: z.int().min(0),
});

export type RuntimeLogSource = z.output<typeof RUNTIME_LOG_SOURCE>;

export const RUNTIME_LOG_SOURCES = z.strictObject({
  sources: z.array(RUNTIME_LOG_SOURCE),
});

export type RuntimeLogSources = z.output<typeof RUNTIME_LOG_SOURCES>;

export const RUNTIME_LOG_COMPONENT = z.strictObject({
  component: z.string().min(1).max(120),
  runtime: LOG_RUNTIME,
  lastAt: MOMENT,
  records: z.int().min(0),
  failures: z.int().min(0),
  lastFailureAt: MOMENT.nullable(),
});

export type RuntimeLogComponent = z.output<typeof RUNTIME_LOG_COMPONENT>;

export const RUNTIME_LOG_COMPONENTS = z.strictObject({
  components: z.array(RUNTIME_LOG_COMPONENT),
});

export type RuntimeLogComponents = z.output<typeof RUNTIME_LOG_COMPONENTS>;

export const RUNTIME_LOG_SIGNATURE = z.strictObject({
  signature: z.string().min(1).max(64),
  component: z.string().min(1).max(120),
  event: z.string().min(1).max(120),
  name: z.string().min(1).max(120).nullable(),
  message: z.string().min(1).max(2000).nullable(),
  occurrences: z.int().min(0),
  firstAt: MOMENT,
  lastAt: MOMENT,
  lastId: z.int().min(1),
});

export type RuntimeLogSignature = z.output<typeof RUNTIME_LOG_SIGNATURE>;

export const RUNTIME_LOG_SIGNATURES = z.strictObject({
  signatures: z.array(RUNTIME_LOG_SIGNATURE),
});

export type RuntimeLogSignatures = z.output<typeof RUNTIME_LOG_SIGNATURES>;

export const RUNTIME_LOG_ROWS = z.strictObject({
  rows: z.array(RUNTIME_LOG_ROW),
});

export type RuntimeLogRows = z.output<typeof RUNTIME_LOG_ROWS>;

export const RUNTIME_LOG_PAGE = z.strictObject({
  rows: z.array(RUNTIME_LOG_ROW),
  more: z.boolean(),
});

export type RuntimeLogPage = z.output<typeof RUNTIME_LOG_PAGE>;

export const RUNTIME_LOG_AROUND = z.strictObject({
  anchor: RUNTIME_LOG_ROW,
  before: z.array(RUNTIME_LOG_ROW),
  after: z.array(RUNTIME_LOG_ROW),
});

export type RuntimeLogAround = z.output<typeof RUNTIME_LOG_AROUND>;

export const RUNTIME_LOG_ACK = z.strictObject({
  stored: z.int().min(0),
  accepted: z.int().min(0),
  alreadyStored: z.int().min(0),
  overflowed: z.boolean(),
});

export type RuntimeLogAck = z.output<typeof RUNTIME_LOG_ACK>;

export const RUNTIME_LOG_DROPPED = z.strictObject({
  dropped: z.int().min(0),
});

export type RuntimeLogDropped = z.output<typeof RUNTIME_LOG_DROPPED>;

export const RUNTIME_LOG_GAP_ROW = z.strictObject({
  firstAt: MOMENT,
  lastAt: MOMENT,
});

export type RuntimeLogGapRow = z.output<typeof RUNTIME_LOG_GAP_ROW>;

export const RUNTIME_LOG_GAPS = z.strictObject({
  gaps: z.array(RUNTIME_LOG_GAP_ROW),
});

export type RuntimeLogGaps = z.output<typeof RUNTIME_LOG_GAPS>;

export const RUNTIME_LOG_GAP = z.strictObject({
  firstSentAt: MOMENT,
  lastSentAt: MOMENT,
});

export type RuntimeLogGap = z.input<typeof RUNTIME_LOG_GAP>;

export const RUNTIME_LOG_PLATFORMS = z.strictObject({
  platforms: z.array(LOG_PLATFORM),
});

export type RuntimeLogPlatforms = z.output<typeof RUNTIME_LOG_PLATFORMS>;
