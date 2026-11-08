import { z } from 'zod';
import { PLANNER_LOCAL_DATE } from './items';

const ID = z.uuid();
const COUNT = z.int().nonnegative();

export const PLANNER_STATS_RANGES = ['week', 'month', 'year'] as const;

export type PlannerStatsRange = (typeof PLANNER_STATS_RANGES)[number];

const TREND_POINT = z.strictObject({ day: PLANNER_LOCAL_DATE, done: COUNT, due: COUNT }).readonly();

export const PLANNER_STATS = z
  .strictObject({
    range: z.enum(PLANNER_STATS_RANGES),
    from: PLANNER_LOCAL_DATE,
    to: PLANNER_LOCAL_DATE,
    completion: z.strictObject({ done: COUNT, due: COUNT }).readonly(),
    on_time: z.strictObject({ on_time: COUNT, late: COUNT }).readonly(),
    streaks: z.strictObject({ current: COUNT, longest: COUNT }).readonly(),
    best_hours: z
      .array(z.strictObject({ hour: z.int().min(0).max(23), done: COUNT }).readonly())
      .readonly(),
    time_by_calendar: z
      .array(z.strictObject({ collection_id: ID, minutes: COUNT }).readonly())
      .readonly(),
    weekly_load: z
      .array(
        z
          .strictObject({ day: PLANNER_LOCAL_DATE, scheduled_minutes: COUNT, items: COUNT })
          .readonly(),
      )
      .readonly(),
    device_share: z.strictObject({ by_device: COUNT, by_hand: COUNT }).readonly(),
    list_trends: z
      .array(
        z.strictObject({ collection_id: ID, points: z.array(TREND_POINT).readonly() }).readonly(),
      )
      .readonly(),
    timer_use: z
      .array(
        z
          .strictObject({
            day: PLANNER_LOCAL_DATE,
            label: z.string().min(1).nullable(),
            count: COUNT,
            total_ms: COUNT,
          })
          .readonly(),
      )
      .readonly(),
    alarms: z
      .array(
        z
          .strictObject({
            alarm_id: ID,
            rang: COUNT,
            missed: COUNT,
            snoozes: COUNT,
            average_minute: z.int().min(0).max(1439).nullable(),
            spread_minutes: COUNT.nullable(),
          })
          .readonly(),
      )
      .readonly(),
  })
  .refine((stats) => stats.from <= stats.to, {
    path: ['to'],
    message: 'the range ends on or after its first day',
  })
  .refine((stats) => stats.completion.done <= stats.completion.due, {
    path: ['completion'],
    message: 'done does not exceed due',
  })
  .readonly();

export type PlannerStats = z.infer<typeof PLANNER_STATS>;
