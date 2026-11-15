import { z } from 'zod';
import { CLOCK_TIME } from '../zoned-clock';
import { PLANNER_LOCAL_DATE } from './items';
import { PLANNER_ALARM_SOUND } from './sounds';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });

export const PLANNER_WEEKDAY = z.int().min(0).max(6);

export const PLANNER_DAYS = z
  .array(PLANNER_WEEKDAY)
  .refine((days) => new Set(days).size === days.length, { message: 'weekdays must not repeat' })
  .readonly();

export const PLANNER_RING_TARGET = z
  .discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('client'), clientId: ID }),
    z.strictObject({ kind: z.literal('device'), deviceId: ID }),
  ])
  .readonly();

export type PlannerRingTarget = z.infer<typeof PLANNER_RING_TARGET>;

export const PLANNER_RING_TARGETS = z.array(PLANNER_RING_TARGET).readonly();

export const PLANNER_WATCH_STATES = ['synced', 'pending', 'failed', 'not_on_watch'] as const;

export type PlannerWatchState = (typeof PLANNER_WATCH_STATES)[number];

export const PLANNER_WATCH_LINK = z
  .strictObject({
    deviceId: ID,
    alarmId: z.int().nonnegative().nullable(),
    hash: z.string().min(1).nullable(),
    state: z.enum(PLANNER_WATCH_STATES),
    detail: z.string().min(1).nullable(),
  })
  .readonly();

export type PlannerWatchLink = z.infer<typeof PLANNER_WATCH_LINK>;

export const PLANNER_MATHS_DIFFICULTIES = ['easy', 'medium', 'hard'] as const;

export const PLANNER_CHALLENGE = z
  .discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('none') }),
    z.strictObject({
      kind: z.literal('maths'),
      difficulty: z.enum(PLANNER_MATHS_DIFFICULTIES),
      count: z.int().positive(),
    }),
    z.strictObject({ kind: z.literal('qr'), code: z.string().min(1) }),
    z.strictObject({ kind: z.literal('steps'), steps: z.int().positive() }),
  ])
  .readonly();

export type PlannerChallenge = z.infer<typeof PLANNER_CHALLENGE>;

export const PLANNER_SUNRISE = z
  .strictObject({
    lights: z
      .array(ID)
      .min(1)
      .refine((lights) => new Set(lights).size === lights.length, {
        message: 'a light is listed once',
      })
      .readonly(),
    minutes: z.int().positive(),
    colour: z.boolean(),
  })
  .readonly();

export type PlannerSunrise = z.infer<typeof PLANNER_SUNRISE>;

export const PLANNER_ALARM_SOURCES = ['planner', 'watch'] as const;

export const PLANNER_ALARM_ROW = z
  .strictObject({
    id: ID,
    profile_id: ID,
    label: z.string().trim().min(1).nullable(),
    time: CLOCK_TIME,
    days: PLANNER_DAYS,
    once_on: PLANNER_LOCAL_DATE.nullable(),
    skip_on: PLANNER_LOCAL_DATE.nullable(),
    enabled: z.boolean(),
    sound: PLANNER_ALARM_SOUND,
    ramp_seconds: z.int().nonnegative(),
    vibrate: z.boolean(),
    snooze_minutes: z.int().positive(),
    snooze_limit: z.int().positive().nullable(),
    challenge: PLANNER_CHALLENGE,
    sunrise: PLANNER_SUNRISE.nullable(),
    smart_minutes: z.int().positive().nullable(),
    wake_automation_id: ID.nullable(),
    wake_lead_minutes: z.int().nonnegative().nullable(),
    targets: PLANNER_RING_TARGETS,
    watch: z.array(PLANNER_WATCH_LINK).readonly(),
    source: z.enum(PLANNER_ALARM_SOURCES),
    created_at: MOMENT,
    updated_at: MOMENT,
  })
  .superRefine((row, context) => {
    if (row.once_on !== null && row.days.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['once_on'],
        message: 'an alarm rings once on a date or on weekdays, not both',
      });
    }
    if ((row.wake_automation_id === null) !== (row.wake_lead_minutes === null)) {
      context.addIssue({
        code: 'custom',
        path: ['wake_lead_minutes'],
        message: 'a wake automation and its lead time are set together',
      });
    }
    const devices = row.watch.map((link) => link.deviceId);
    if (new Set(devices).size !== devices.length) {
      context.addIssue({
        code: 'custom',
        path: ['watch'],
        message: 'an alarm links to each watch once',
      });
    }
  })
  .readonly();

export type PlannerAlarmRow = z.infer<typeof PLANNER_ALARM_ROW>;
