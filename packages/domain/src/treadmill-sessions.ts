import { z } from 'zod';
import { BELT_MODES, HEART_RATE_SOURCES, SESSION_KINDS, SESSION_SOURCES } from './treadmill';
import { KCAL_SOURCES } from './treadmill-calories';

export const SESSION_ZONE_SECONDS = z.strictObject({
  walk: z.number().nonnegative(),
  jog: z.number().nonnegative(),
  run: z.number().nonnegative(),
});

export type SessionZoneSeconds = z.infer<typeof SESSION_ZONE_SECONDS>;

export const TREADMILL_SESSION = z.strictObject({
  id: z.string().min(1),
  deviceId: z.string().min(1),
  walkerProfileId: z.string().min(1).nullable(),
  startedAt: z.iso.datetime({ offset: true }),
  endedAt: z.iso.datetime({ offset: true }),
  zoneOffsetSeconds: z.number().int(),
  activeSeconds: z.number().nonnegative(),
  pausedSeconds: z.number().nonnegative(),
  distanceM: z.number().nonnegative(),
  steps: z.number().int().nonnegative().nullable(),
  kcal: z.number().nonnegative().nullable(),
  kcalNet: z.number().nonnegative().nullable(),
  avgKmh: z.number().nonnegative(),
  maxKmh: z.number().nonnegative(),
  mode: z.enum(BELT_MODES).nullable(),
  kind: z.enum(SESSION_KINDS),
  zones: SESSION_ZONE_SECONDS,
  splits: z.array(z.number().positive()),
  source: z.enum(SESSION_SOURCES),
  climbM: z.number().nonnegative().nullable().default(null),
  inclineAvg: z.number().nonnegative().nullable().default(null),
  inclineMax: z.number().nonnegative().nullable().default(null),
  inclineSeconds: z.record(z.string(), z.number().nonnegative()).default({}),
  kcalSource: z.enum(KCAL_SOURCES).nullable().default(null),
  kcalEstimate: z.number().nonnegative().nullable().default(null),
  heartRateSource: z.enum(HEART_RATE_SOURCES).nullable().default(null),
});

export type TreadmillSession = z.infer<typeof TREADMILL_SESSION>;

export const SESSION_SAMPLE = z.strictObject({
  t: z.number().nonnegative(),
  kmh: z.number().nonnegative(),
  distanceM: z.number().nonnegative(),
  steps: z.number().int().nonnegative().nullable(),
  incline: z.number().nonnegative().nullable().default(null),
  state: z.enum(['running', 'paused']),
});

export type SessionSample = z.infer<typeof SESSION_SAMPLE>;

export const SESSION_SEGMENT = z.strictObject({
  fromS: z.number().nonnegative(),
  toS: z.number().nonnegative(),
  avgKmh: z.number().nonnegative(),
  state: z.enum(['running', 'paused']),
});

export type SessionSegment = z.infer<typeof SESSION_SEGMENT>;

export const SESSION_DETAIL = z.strictObject({
  session: TREADMILL_SESSION,
  profile: z.array(SESSION_SAMPLE),
  segments: z.array(SESSION_SEGMENT),
  cadence: z.number().nullable(),
  strideM: z.number().nullable(),
  met: z.number().nullable(),
  paceSecondsPerKm: z.number().nullable(),
});

export type SessionDetail = z.infer<typeof SESSION_DETAIL>;

export const MIN_SESSION_SECONDS = 10;

export function isWorthKeeping(session: Pick<TreadmillSession, 'activeSeconds'>): boolean {
  return session.activeSeconds >= MIN_SESSION_SECONDS;
}
