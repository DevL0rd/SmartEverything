import { z } from 'zod';
import { SIGNAL_INPUT } from '../signals';
import { CLOCK_TIME } from '../zoned-clock';
import { PLANNER_DAYS } from './alarms';
import { PLANNER_SLEEP_SOUND, PLANNER_SLEEP_SOURCE } from './sounds';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });

export const PLANNER_BEDTIME_NIGHT = z
  .strictObject({
    days: PLANNER_DAYS.refine((days) => days.length > 0, {
      message: 'a bedtime applies to at least one weekday',
    }),
    bed: CLOCK_TIME,
    wake: CLOCK_TIME,
  })
  .refine((night) => night.bed !== night.wake, {
    path: ['wake'],
    message: 'the wake time differs from the bed time',
  })
  .readonly();

export type PlannerBedtimeNight = z.infer<typeof PLANNER_BEDTIME_NIGHT>;

export const PLANNER_BEDTIME = z
  .strictObject({
    enabled: z.boolean(),
    schedule: z.array(PLANNER_BEDTIME_NIGHT).readonly(),
    reminder_minutes: z.int().positive().nullable(),
    wind_down_minutes: z.int().positive().nullable(),
    wind_down_automation_id: ID.nullable(),
    do_not_disturb: z.boolean(),
    sleep_sound: PLANNER_SLEEP_SOUND.nullable(),
  })
  .superRefine((bedtime, context) => {
    const days = bedtime.schedule.flatMap((night) => night.days);
    if (new Set(days).size !== days.length) {
      context.addIssue({
        code: 'custom',
        path: ['schedule'],
        message: 'a weekday has one bedtime',
      });
    }
  })
  .readonly();

export type PlannerBedtime = z.infer<typeof PLANNER_BEDTIME>;

export const PLANNER_SLEEP_SOUNDS = z
  .strictObject({
    sound: PLANNER_SLEEP_SOUND.nullable(),
    timer_minutes: z.int().positive().nullable(),
    fade_seconds: z.int().nonnegative(),
  })
  .readonly();

export type PlannerSleepSounds = z.infer<typeof PLANNER_SLEEP_SOUNDS>;

export const PLANNER_BEDTIME_WINDOW = z
  .strictObject({ windDownAt: MOMENT, bedAt: MOMENT, wakeAt: MOMENT })
  .refine(
    (window) =>
      Date.parse(window.windDownAt) <= Date.parse(window.bedAt) &&
      Date.parse(window.bedAt) < Date.parse(window.wakeAt),
    {
      path: ['wakeAt'],
      message: 'wind-down starts no later than bed and bed comes before the wake time',
    },
  )
  .readonly();

export type PlannerBedtimeWindow = z.infer<typeof PLANNER_BEDTIME_WINDOW>;

export const PLANNER_BEDTIME_SIGNAL_KINDS = [
  'bedtime_reminder',
  'wind_down_started',
  'wake_time',
] as const;

export type PlannerBedtimeSignalKind = (typeof PLANNER_BEDTIME_SIGNAL_KINDS)[number];

const BEDTIME_BASE = {
  ...SIGNAL_INPUT.shape,
  source: z.literal('planner'),
  subject: ID,
  field: z.null(),
};

export const PLANNER_BEDTIME_SIGNALS = [
  z.strictObject({
    ...BEDTIME_BASE,
    kind: z.literal('bedtime_reminder'),
    data: z.strictObject({ bedAt: MOMENT, minutesBefore: z.int().positive() }),
  }),
  z.strictObject({
    ...BEDTIME_BASE,
    kind: z.literal('wind_down_started'),
    data: z.strictObject({ bedAt: MOMENT, wakeAt: MOMENT, minutes: z.int().positive() }),
  }),
  z.strictObject({
    ...BEDTIME_BASE,
    kind: z.literal('wake_time'),
    data: z.strictObject({ wakeAt: MOMENT }),
  }),
] as const;

export const PLANNER_BEDTIME_NOTICE = z.strictObject({
  type: z.literal('planner_bedtime'),
  bedAt: MOMENT,
  minutesBefore: z.int().positive(),
});

export type PlannerBedtimeNotice = z.infer<typeof PLANNER_BEDTIME_NOTICE>;

export const PLANNER_WIND_DOWN_NOTICE = z.strictObject({
  type: z.literal('planner_wind_down'),
  bedAt: MOMENT,
  wakeAt: MOMENT,
  minutes: z.int().positive(),
});

export type PlannerWindDownNotice = z.infer<typeof PLANNER_WIND_DOWN_NOTICE>;

export const PLANNER_SLEEP_SOUND_NOTICE = z
  .strictObject({
    type: z.literal('planner_sleep_sound'),
    action: z.enum(['play', 'stop']),
    sound: PLANNER_SLEEP_SOURCE.nullable(),
    timerMinutes: z.int().positive().nullable(),
    fadeSeconds: z.int().nonnegative(),
  })
  .refine((notice) => (notice.action === 'play') === (notice.sound !== null), {
    path: ['sound'],
    message: 'playing names a sound and stopping names none',
  });

export type PlannerSleepSoundNotice = z.infer<typeof PLANNER_SLEEP_SOUND_NOTICE>;
