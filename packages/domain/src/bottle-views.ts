import { z } from 'zod';
import {
  BOTTLE_BODY,
  BOTTLE_CHARGING,
  BOTTLE_LINKS,
  BOTTLE_ORIENTATIONS,
  BOTTLE_SYNC_OUTCOMES,
} from './bottle';
import { BOTTLE_DAY } from './bottle-days';
import { BOTTLE_DRINK_ROW, BOTTLE_READING_ROW, BOTTLE_SESSION } from './bottle-rows';
import { BOTTLE_FILTER_STATUS, BOTTLE_QUIET, BOTTLE_REMINDER } from './bottle-settings';

const MOMENT = z.iso.datetime({ offset: true });

const COUNT = z.int().nonnegative();

const ML = z.number().nonnegative();

export const BOTTLE_PERSON = z.strictObject({ id: z.uuid(), name: z.string().min(1) });

export type BottlePerson = z.infer<typeof BOTTLE_PERSON>;

export const BOTTLE_LEVEL = z.strictObject({
  ml: COUNT.nullable(),
  pct: z.number().min(0).max(110).nullable(),
  at: MOMENT.nullable(),
  reliable: z.boolean(),
  quality: z.enum(['good', 'acceptable', 'weak']).nullable(),
});

export const BOTTLE_CAP = z.strictObject({
  state: z.string().min(1),
  stateCode: COUNT.nullable(),
  at: MOMENT.nullable(),
  charging: z.enum(BOTTLE_CHARGING),
  batteryPct: z.int().min(0).max(100).nullable(),
  daysLeft: COUNT.nullable(),
  lowBattery: z.boolean(),
  locked: z.boolean(),
  interlock: z.boolean(),
  cleaning: z.boolean(),
  fault: z.string().nullable(),
});

export type BottleCap = z.infer<typeof BOTTLE_CAP>;

export const BOTTLE_ORIENTATION_SNAPSHOT = z.strictObject({
  orientation: z.enum(BOTTLE_ORIENTATIONS),
  x: z.number(),
  y: z.number(),
  z: z.number(),
  at: MOMENT,
});

export const BOTTLE_TODAY = z.strictObject({
  day: BOTTLE_DAY,
  goalMl: ML,
  totalMl: ML,
  bottleMl: ML,
  loggedMl: ML,
  otherMl: ML,
  hourly: z.array(ML).length(24),
  drinks: z.array(BOTTLE_DRINK_ROW),
  fills: z.array(BOTTLE_DRINK_ROW),
  levels: z.array(BOTTLE_READING_ROW),
  lastDrinkAt: MOMENT.nullable(),
  paceFromMinute: COUNT,
  paceToMinute: COUNT,
});

export type BottleToday = z.infer<typeof BOTTLE_TODAY>;

export const BOTTLE_STATUS_VIEW = z.strictObject({
  view: z.literal('status'),
  deviceId: z.uuid(),
  name: z.string().min(1),
  room: z.string().nullable(),
  model: z.string().min(1),
  body: BOTTLE_BODY,
  link: z.enum(BOTTLE_LINKS),
  lastSeenAt: MOMENT.nullable(),
  lastSyncAt: MOMENT.nullable(),
  lastSyncOutcome: z.enum(BOTTLE_SYNC_OUTCOMES).nullable(),
  lastSyncDetail: z.string().nullable(),
  firstSyncPending: z.boolean(),
  holder: z.strictObject({ name: z.string().min(1), isYou: z.boolean() }).nullable(),
  person: BOTTLE_PERSON.nullable(),
  boundBy: z.string().nullable(),
  noticePending: z.boolean(),
  level: BOTTLE_LEVEL,
  cap: BOTTLE_CAP,
  orientation: BOTTLE_ORIENTATION_SNAPSHOT.nullable(),
  uv: z.strictObject({ lastAt: MOMENT.nullable(), lastMode: z.string().nullable() }),
  today: BOTTLE_TODAY,
  reminder: BOTTLE_REMINDER.nullable(),
  quiet: BOTTLE_QUIET.nullable(),
  pending: z.strictObject({ reminder: z.boolean(), quiet: z.boolean() }),
  filter: BOTTLE_FILTER_STATUS.nullable(),
  clockDriftSeconds: z.number().nullable(),
  firmware: z.string().nullable(),
  historyFrom: MOMENT.nullable(),
  mayStartUv: z.boolean(),
  uvRefusal: z.string().nullable(),
  maySettings: z.boolean(),
});

export type BottleStatusView = z.infer<typeof BOTTLE_STATUS_VIEW>;

export const BOTTLE_DRINKS_VIEW = z.strictObject({
  view: z.literal('drinks'),
  drinks: z.array(BOTTLE_DRINK_ROW),
  more: z.boolean(),
});

export const BOTTLE_READINGS_VIEW = z.strictObject({
  view: z.literal('readings'),
  readings: z.array(BOTTLE_READING_ROW),
  more: z.boolean(),
});

export const BOTTLE_SESSIONS_VIEW = z.strictObject({
  view: z.literal('sessions'),
  sessions: z.array(BOTTLE_SESSION),
  more: z.boolean(),
});
