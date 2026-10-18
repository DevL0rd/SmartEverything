import { z } from 'zod';
import { HEALTH_RECORD } from './health';
import { BLUETOOTH_MAC } from './mac-address';
import { WATCH_CONFIG } from './watch-control';
import { WATCH_WORKOUT } from './watch-workouts';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });

export const WATCH_FAMILIES = ['xiaomi'] as const;

export type WatchFamily = (typeof WATCH_FAMILIES)[number];

export const WATCH_AUTH_KEY = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[0-9a-f]{32}$/);

export const WATCH_CANDIDATE = z.object({
  family: z.enum(WATCH_FAMILIES),
  name: z.string().min(1),
  model: z.string().min(1).nullable(),
  address: BLUETOOTH_MAC,
  deviceId: ID.nullable(),
  replaces: ID.nullable(),
});

export type WatchCandidate = z.infer<typeof WATCH_CANDIDATE>;

export const WATCH_CANDIDATES = z.object({
  watches: z.array(WATCH_CANDIDATE),
  skipped: z.int().min(0),
});

export type WatchCandidates = z.infer<typeof WATCH_CANDIDATES>;

export const PHONE_WATCH = z.object({
  deviceId: ID,
  family: z.enum(WATCH_FAMILIES),
  name: z.string().min(1),
  model: z.string().min(1).nullable(),
  address: BLUETOOTH_MAC,
  authKey: WATCH_AUTH_KEY,
});

export type PhoneWatch = z.infer<typeof PHONE_WATCH>;

export const PHONE_WATCHES = z.object({ watches: z.array(PHONE_WATCH) });

export const WATCH_BRIDGE = z.object({
  clientId: ID,
  clientName: z.string().min(1),
  since: MOMENT,
});

export type WatchBridge = z.infer<typeof WATCH_BRIDGE>;

export const WATCH_PHASES = [
  'paused',
  'waiting',
  'connecting',
  'authenticating',
  'connected',
  'failed',
] as const;

export type WatchPhase = (typeof WATCH_PHASES)[number];

export const WATCH_STATE = z.object({
  phase: z.enum(WATCH_PHASES),
  battery: z.int().min(0).max(100).nullable(),
  charging: z.boolean().nullable(),
  worn: z.boolean().nullable(),
  firmware: z.string().nullable(),
  steps: z.int().min(0).nullable(),
  heartRate: z.int().min(0).max(255).nullable(),
  lastSyncAt: MOMENT.nullable(),
  error: z.string().nullable(),
  at: MOMENT,
  config: WATCH_CONFIG.optional(),
  workout: WATCH_WORKOUT.optional(),
});

export type WatchState = z.infer<typeof WATCH_STATE>;

export const WATCH_SOURCE_APP = 'smarteverything.watch';

export const WATCH_SAMPLE_KINDS = ['stress', 'vitality'] as const;

export type WatchSampleKind = (typeof WATCH_SAMPLE_KINDS)[number];

const DAY = z.iso.date();

export const WATCH_SAMPLE = z.object({
  time: MOMENT,
  value: z.int().min(0).max(1000),
});

export type WatchSample = z.infer<typeof WATCH_SAMPLE>;

export const WATCH_SAMPLE_BATCH = z.object({
  kind: z.enum(WATCH_SAMPLE_KINDS),
  zoneOffsetSeconds: z.int().min(-64_800).max(64_800),
  samples: z.array(WATCH_SAMPLE).min(1),
});

export type WatchSampleBatch = z.infer<typeof WATCH_SAMPLE_BATCH>;

const WATCH_ROUTE_POINT = z.object({
  time: MOMENT,
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  altitudeMeters: z.number().nullable(),
  horizontalAccuracyMeters: z.number().min(0).nullable(),
});

export const WATCH_ROUTE = z.object({
  start: MOMENT,
  points: z.array(WATCH_ROUTE_POINT).min(1),
});

export type WatchRoute = z.infer<typeof WATCH_ROUTE>;

export const WATCH_RECORDS = z
  .object({
    records: z.array(HEALTH_RECORD),
    samples: z.array(WATCH_SAMPLE_BATCH).default([]),
    routes: z.array(WATCH_ROUTE).default([]),
  })
  .refine((body) => body.records.length + body.samples.length + body.routes.length > 0, {
    message: 'send at least one record, sample batch or route',
  });

export const WATCH_RECORDS_SAVED = z.object({
  saved: z.int().min(0),
  samples: z.int().min(0).default(0),
  unmatchedRoutes: z.array(MOMENT).default([]),
  rejected: z.int().min(0).default(0),
});

export const WATCH_DAY_ROW = z.object({
  profile_id: ID,
  device_id: ID,
  day: DAY,
  kind: z.enum(WATCH_SAMPLE_KINDS),
  samples: z.array(WATCH_SAMPLE),
  updated_at: MOMENT,
});

export type WatchDayRow = z.infer<typeof WATCH_DAY_ROW>;

export const WATCH_DAYS = z.object({ days: z.array(WATCH_DAY_ROW) });
