import { z } from 'zod';
import { CLOCK_TIME } from '../zoned-clock';
import { PLANNER_LOCAL_DATE } from './items';

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
    sound: z.string().trim().min(1),
    ramp_seconds: z.int().nonnegative(),
    vibrate: z.boolean(),
    snooze_minutes: z.int().positive(),
    smart_minutes: z.int().positive().nullable(),
    wake_scene_id: ID.nullable(),
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
    if ((row.wake_scene_id === null) !== (row.wake_lead_minutes === null)) {
      context.addIssue({
        code: 'custom',
        path: ['wake_lead_minutes'],
        message: 'a wake scene and its lead time are set together',
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
