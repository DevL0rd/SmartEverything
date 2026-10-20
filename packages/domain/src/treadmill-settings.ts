import { z } from 'zod';
import { DEFAULT_GRADE_PERCENT, DEFAULT_RUN_SWITCH_KMH } from './treadmill-calories';
import { MAX_BELT_KMH, MIN_BELT_KMH } from './treadmill';
import { DEFAULT_REMOTE_INCLINE_MAX, INCLINE_SCALES } from './treadmill-incline';

export const REMOTE_START_WHO = ['owner', 'owner_and_walker'] as const;

export type RemoteStartWho = (typeof REMOTE_START_WHO)[number];

export const DEFAULT_REMOTE_MAX_KMH = 6;

export const DEFAULT_LUBRICATION_DAYS = 90;

export const NO_STEPS_SECONDS = 30;

export const TREADMILL_POLICY = z.strictObject({
  remoteStart: z.boolean().default(false),
  remoteWho: z.enum(REMOTE_START_WHO).default('owner'),
  remoteMaxKmh: z.number().min(MIN_BELT_KMH).max(MAX_BELT_KMH).default(DEFAULT_REMOTE_MAX_KMH),
  stopWithoutSteps: z.boolean().default(true),
  remoteIncline: z.boolean().default(false),
  remoteInclineMax: z.number().min(0).default(DEFAULT_REMOTE_INCLINE_MAX),
});

export type TreadmillPolicy = z.infer<typeof TREADMILL_POLICY>;

export const TREADMILL_GOALS = z.strictObject({
  dailyMinutes: z.number().int().positive().default(30),
  weeklyKm: z.number().positive().default(20),
  weeklySessions: z.number().int().positive().default(5),
  dailySteps: z.number().int().positive().nullable().default(null),
  dailyKcal: z.number().int().positive().nullable().default(null),
});

export type TreadmillGoals = z.infer<typeof TREADMILL_GOALS>;

export const TREADMILL_SETTINGS = z.strictObject({
  policy: TREADMILL_POLICY.default(TREADMILL_POLICY.parse({})),
  gradePercent: z.number().min(0).max(15).default(DEFAULT_GRADE_PERCENT),
  inclineScale: z.enum(INCLINE_SCALES).default('unconfirmed'),
  runSwitchKmh: z.number().min(MIN_BELT_KMH).max(MAX_BELT_KMH).default(DEFAULT_RUN_SWITCH_KMH),
  stayConnected: z.boolean().default(true),
  presence: z.boolean().default(true),
  lubricatedAt: z.iso.datetime({ offset: true }).nullable().default(null),
  lubricationDays: z.number().int().positive().default(DEFAULT_LUBRICATION_DAYS),
  goals: z.record(z.string(), TREADMILL_GOALS).default({}),
});

export type TreadmillSettings = z.infer<typeof TREADMILL_SETTINGS>;

export const TREADMILL_SETTINGS_CHANGE = z.strictObject({
  policy: TREADMILL_POLICY.partial().optional(),
  gradePercent: TREADMILL_SETTINGS.shape.gradePercent.optional(),
  inclineScale: TREADMILL_SETTINGS.shape.inclineScale.optional(),
  runSwitchKmh: TREADMILL_SETTINGS.shape.runSwitchKmh.optional(),
  stayConnected: z.boolean().optional(),
  presence: z.boolean().optional(),
  lubricationDays: TREADMILL_SETTINGS.shape.lubricationDays.optional(),
});

export type TreadmillSettingsChange = z.infer<typeof TREADMILL_SETTINGS_CHANGE>;

export function settingsOf(raw: unknown): TreadmillSettings {
  return TREADMILL_SETTINGS.parse(raw ?? {});
}

export function goalsOf(settings: TreadmillSettings, profileId: string | null): TreadmillGoals {
  const own = profileId === null ? undefined : settings.goals[profileId];
  return own ?? TREADMILL_GOALS.parse({});
}

export interface Starter {
  readonly owner: boolean;
  readonly walker: boolean;
  readonly remote: boolean;
}

export type StartVerdict =
  { readonly allowed: true } | { readonly allowed: false; readonly reason: string };

const NOT_HOLDER =
  'Start the belt from the phone that holds the link, or ask the owner to allow remote start in the treadmill settings.';

export function remoteStartVerdict(policy: TreadmillPolicy, starter: Starter): StartVerdict {
  if (!starter.remote) {
    return { allowed: true };
  }
  if (!policy.remoteStart) {
    return { allowed: false, reason: NOT_HOLDER };
  }
  const permitted = starter.owner || (policy.remoteWho === 'owner_and_walker' && starter.walker);
  return permitted
    ? { allowed: true }
    : {
        allowed: false,
        reason: 'Remote start is allowed for the owner only; ask the owner to start the belt.',
      };
}

export function remoteSpeedVerdict(
  policy: TreadmillPolicy,
  starter: Starter,
  currentKmh: number,
  requestedKmh: number,
): StartVerdict {
  if (!starter.remote || requestedKmh <= currentKmh) {
    return { allowed: true };
  }
  if (!policy.remoteStart) {
    return { allowed: false, reason: NOT_HOLDER };
  }
  return requestedKmh > policy.remoteMaxKmh
    ? {
        allowed: false,
        reason: `Remote speed is capped at ${String(policy.remoteMaxKmh)} km/h in the treadmill settings.`,
      }
    : { allowed: true };
}
