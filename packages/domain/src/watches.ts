import { z } from 'zod';
import { HEALTH_BATCH_LIMIT, HEALTH_RECORD } from './health';
import { WATCH_CONFIG } from './watch-control';
import { WATCH_WORKOUT } from './watch-workouts';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });

export const WATCH_FAMILIES = ['xiaomi'] as const;

export type WatchFamily = (typeof WATCH_FAMILIES)[number];

export const WATCH_ADDRESS = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/);

export const WATCH_AUTH_KEY = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[0-9a-f]{32}$/);

export const WATCH_CANDIDATE = z.strictObject({
  family: z.enum(WATCH_FAMILIES),
  name: z.string().min(1).max(120),
  model: z.string().min(1).nullable(),
  address: WATCH_ADDRESS,
  deviceId: ID.nullable(),
  replaces: ID.nullable(),
});

export type WatchCandidate = z.infer<typeof WATCH_CANDIDATE>;

export const WATCH_CANDIDATES = z.strictObject({
  watches: z.array(WATCH_CANDIDATE),
  skipped: z.int().min(0),
});

export type WatchCandidates = z.infer<typeof WATCH_CANDIDATES>;

export const PHONE_WATCH = z.strictObject({
  deviceId: ID,
  family: z.enum(WATCH_FAMILIES),
  name: z.string().min(1),
  model: z.string().min(1).nullable(),
  address: WATCH_ADDRESS,
  authKey: WATCH_AUTH_KEY,
});

export type PhoneWatch = z.infer<typeof PHONE_WATCH>;

export const PHONE_WATCHES = z.strictObject({ watches: z.array(PHONE_WATCH) });

export const WATCH_PHASES = [
  'paused',
  'waiting',
  'connecting',
  'authenticating',
  'connected',
  'failed',
] as const;

export type WatchPhase = (typeof WATCH_PHASES)[number];

export const WATCH_STATE = z.strictObject({
  phase: z.enum(WATCH_PHASES),
  battery: z.int().min(0).max(100).nullable(),
  charging: z.boolean().nullable(),
  worn: z.boolean().nullable(),
  firmware: z.string().max(80).nullable(),
  steps: z.int().min(0).nullable(),
  heartRate: z.int().min(0).max(255).nullable(),
  lastSyncAt: MOMENT.nullable(),
  error: z.string().max(400).nullable(),
  at: MOMENT,
  config: WATCH_CONFIG.optional(),
  workout: WATCH_WORKOUT.optional(),
});

export type WatchState = z.infer<typeof WATCH_STATE>;

export const WATCH_SOURCE_APP = 'smarteverything.watch';

export const WATCH_SAMPLE_KINDS = ['stress', 'vitality'] as const;

export type WatchSampleKind = (typeof WATCH_SAMPLE_KINDS)[number];

const DAY = z.iso.date();

export const WATCH_SAMPLE = z.strictObject({
  time: MOMENT,
  value: z.int().min(0).max(1000),
});

export type WatchSample = z.infer<typeof WATCH_SAMPLE>;

export const WATCH_SAMPLE_BATCH = z.strictObject({
  kind: z.enum(WATCH_SAMPLE_KINDS),
  zoneOffsetSeconds: z.int().min(-64_800).max(64_800),
  samples: z
    .array(WATCH_SAMPLE)
    .min(1)
    .max(HEALTH_BATCH_LIMIT * 4),
});

export type WatchSampleBatch = z.infer<typeof WATCH_SAMPLE_BATCH>;

export const WATCH_ROUTE_POINT = z.strictObject({
  time: MOMENT,
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  altitudeMeters: z.number().nullable(),
  horizontalAccuracyMeters: z.number().min(0).nullable(),
});

export const WATCH_ROUTE = z.strictObject({
  start: MOMENT,
  points: z.array(WATCH_ROUTE_POINT).min(1).max(20_000),
});

export type WatchRoute = z.infer<typeof WATCH_ROUTE>;

export const WATCH_RECORDS = z
  .strictObject({
    records: z.array(HEALTH_RECORD).max(HEALTH_BATCH_LIMIT),
    samples: z.array(WATCH_SAMPLE_BATCH).max(50).default([]),
    routes: z.array(WATCH_ROUTE).max(20).default([]),
  })
  .refine((body) => body.records.length + body.samples.length + body.routes.length > 0, {
    message: 'send at least one record, sample batch or route',
  });

export const WATCH_RECORDS_SAVED = z.strictObject({
  saved: z.int().min(0),
  samples: z.int().min(0).default(0),
  unmatchedRoutes: z.array(MOMENT).default([]),
});

export const WATCH_DAY_ROW = z.strictObject({
  profile_id: ID,
  device_id: ID,
  day: DAY,
  kind: z.enum(WATCH_SAMPLE_KINDS),
  samples: z.array(WATCH_SAMPLE),
  updated_at: MOMENT,
});

export type WatchDayRow = z.infer<typeof WATCH_DAY_ROW>;

export const WATCH_DAYS = z.strictObject({ days: z.array(WATCH_DAY_ROW) });
