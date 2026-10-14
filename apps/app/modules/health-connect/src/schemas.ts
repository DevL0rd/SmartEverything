import { HEALTH_RECORD_TYPE, HEALTH_SOURCE_TOKEN, WATCH_PHASES } from '@smarteverything/domain';
import { z } from 'zod';

const MINIMUM_INTERVAL_MINUTES = 15;

export const DEFAULT_INTERVAL_MINUTES = 60;

const AVAILABILITY = z.enum(['available', 'unavailable']);
const COUNT = z.number().int().min(0);
const MOMENT = z.iso.datetime({ offset: true });

export const HEALTH_CONNECT_STATUS = z.discriminatedUnion('sdk', [
  z.object({
    sdk: z.literal('available'),
    features: z.object({
      backgroundRead: AVAILABILITY,
      historyRead: AVAILABILITY,
      skinTemperature: AVAILABILITY,
      plannedExercise: AVAILABILITY,
      mindfulnessSession: AVAILABILITY,
    }),
    readableTypes: z.array(HEALTH_RECORD_TYPE),
  }),
  z.object({ sdk: z.literal('unavailable') }),
  z.object({ sdk: z.literal('provider_update_required') }),
]);

export type HealthConnectStatus = z.infer<typeof HEALTH_CONNECT_STATUS>;

export const HEALTH_CONNECT_GRANTS = z.object({
  types: z.array(HEALTH_RECORD_TYPE),
  writeTypes: z.array(HEALTH_RECORD_TYPE).optional(),
  background: z.boolean(),
  history: z.boolean(),
});

export type HealthConnectGrants = z.infer<typeof HEALTH_CONNECT_GRANTS>;

export const PERMISSION_REQUEST = z.object({
  types: z.array(HEALTH_RECORD_TYPE).min(1),
  background: z.boolean(),
  history: z.boolean(),
});

export type PermissionRequest = z.infer<typeof PERMISSION_REQUEST>;

export const SYNC_TARGET = z.object({
  endpoint: z.url({ protocol: /^https?$/ }),
  token: HEALTH_SOURCE_TOKEN,
});

export type SyncTarget = z.infer<typeof SYNC_TARGET>;

export const SYNC_SCHEDULE = z.object({
  intervalMinutes: z.number().int().min(MINIMUM_INTERVAL_MINUTES),
});

export type SyncSchedule = z.infer<typeof SYNC_SCHEDULE>;

export const SYNC_PHASES = ['backfill', 'changes', 'recovery'] as const;

export const SYNC_PROGRESS = z.object({
  type: HEALTH_RECORD_TYPE,
  phase: z.enum(SYNC_PHASES),
  records: COUNT,
  deletions: COUNT,
});

export type SyncProgress = z.infer<typeof SYNC_PROGRESS>;

export const SYNC_REPORT = z.object({
  trigger: z.enum(['manual', 'scheduled']),
  startedAt: MOMENT,
  finishedAt: MOMENT,
  outcome: z.enum(['succeeded', 'failed', 'retrying']),
  records: COUNT,
  deletions: COUNT,
  types: z.array(HEALTH_RECORD_TYPE),
  error: z.string().nullable(),
});

export type SyncReport = z.infer<typeof SYNC_REPORT>;

export const WRITE_REPORT = z.object({
  written: COUNT,
  waiting: COUNT,
  missingPermission: z.boolean(),
});

export type WriteReport = z.infer<typeof WRITE_REPORT>;

export const ENTRY_REPORT = z.object({
  written: COUNT,
  waiting: COUNT,
  failed: COUNT,
  missingTypes: z.array(HEALTH_RECORD_TYPE),
});

export type EntryReport = z.infer<typeof ENTRY_REPORT>;

export const SCALE_RELAY_STATUS = z.object({
  permission: z.boolean(),
  bluetooth: z.boolean(),
  watching: COUNT,
  registeredAt: MOMENT.nullable(),
  lastHeardAt: MOMENT.nullable(),
  lastUploadedAt: MOMENT.nullable(),
  lastError: z.string().nullable(),
  lastErrorAt: MOMENT.nullable(),
});

export type ScaleRelayStatus = z.infer<typeof SCALE_RELAY_STATUS>;

export const SCALE_EVENT = z.object({
  event: z.enum([
    'registered',
    'heard',
    'ignored',
    'uploaded',
    'failed',
    'live_started',
    'live_stopped',
    'health_connect_skipped',
  ]),
  detail: z.string(),
  at: MOMENT,
});

export type ScaleEvent = z.infer<typeof SCALE_EVENT>;

export const WATCH_EVENT = z.object({
  event: z.string().min(1),
  detail: z.string(),
  at: MOMENT,
  deviceId: z.string().optional(),
});

export type WatchEvent = z.infer<typeof WATCH_EVENT>;

const MAYBE_TEXT = z.string().nullable();
const MAYBE_COUNT = z.int().min(0).nullable();

export const PHONE_WATCH_STATUS = z.object({
  deviceId: z.string().min(1),
  name: z.string(),
  address: z.string(),
  family: z.string(),
  model: MAYBE_TEXT,
  phase: z.enum(WATCH_PHASES),
  detail: z.string(),
  battery: MAYBE_COUNT,
  charging: z.boolean().nullable(),
  worn: z.boolean().nullable(),
  firmware: MAYBE_TEXT,
  steps: MAYBE_COUNT,
  heartRate: MAYBE_COUNT,
  error: MAYBE_TEXT,
  connectedAt: MOMENT.nullable(),
  activeKcal: MAYBE_COUNT,
  configJson: z.string().nullable(),
  workoutJson: z.string().nullable().optional(),
  syncing: z.boolean(),
  syncDetail: MAYBE_TEXT,
  syncError: MAYBE_TEXT,
  lastSyncAt: MOMENT.nullable(),
  updatedAt: MOMENT,
  paused: z.boolean(),
  associated: z.boolean(),
  permission: z.boolean(),
  vendorApps: z.array(
    z.object({
      packageName: z.string().min(1),
      label: z.string().min(1),
      state: z.enum(['blocked', 'allowed']),
    }),
  ),
});

export type PhoneWatchStatus = z.infer<typeof PHONE_WATCH_STATUS>;

export const PHONE_WATCH_STATUSES = z.array(PHONE_WATCH_STATUS);

export const WATCH_FAMILY_INFO = z.array(z.object({ id: z.string(), label: z.string() }));

export const ASSOCIATION_RESULT = z.string().min(1);

export const WATCH_RELAY_STATUS = z.object({
  enabled: z.boolean(),
  apps: z.array(z.string()),
  content: z.enum(['full', 'title', 'app']),
  onlyWhenLocked: z.boolean(),
  calls: z.boolean(),
  music: z.boolean(),
  findPhone: z.boolean(),
  listenerAllowed: z.boolean(),
  callPermissionsMissing: z.array(z.string()),
  dndAllowed: z.boolean(),
});

export type WatchRelayStatus = z.infer<typeof WATCH_RELAY_STATUS>;

export type WatchRelayChange = Partial<
  Pick<
    WatchRelayStatus,
    'enabled' | 'apps' | 'content' | 'onlyWhenLocked' | 'calls' | 'music' | 'findPhone'
  >
>;

export const PHONE_APPS = z.array(z.object({ packageName: z.string().min(1), label: z.string() }));

export type PhoneApp = z.infer<typeof PHONE_APPS>[number];
