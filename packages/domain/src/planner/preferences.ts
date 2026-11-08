import { z } from 'zod';
import { TIME_ZONE } from '../automations';
import { CLOCK_TIME } from '../zoned-clock';
import { PLANNER_DAYS, PLANNER_RING_TARGETS, PLANNER_WEEKDAY } from './alarms';
import { PLANNER_REMINDERS } from './collections';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });

export const PLANNER_FADE_STRENGTHS = ['off', 'soft', 'strong'] as const;

export const PLANNER_MISSED_SCOPES = ['since_last_open', 'today'] as const;

export const PLANNER_SMART_LISTS = [
  'today',
  'upcoming',
  'overdue',
  'device_tasks',
  'habits',
  'someday',
  'completed',
] as const;

export const PLANNER_CALENDAR_VIEWS = [
  'day',
  'three_days',
  'week',
  'month',
  'year',
  'agenda',
  'people',
] as const;

export const PLANNER_BRIEFINGS = ['off', 'after_alarm', 'day_start'] as const;

const WORKING_HOURS = z
  .strictObject({ days: PLANNER_DAYS, start: CLOCK_TIME, end: CLOCK_TIME })
  .readonly();

const WORLD_CLOCK = z
  .strictObject({ time_zone: TIME_ZONE, label: z.string().trim().min(1).nullable() })
  .readonly();

const GENERAL = z
  .strictObject({
    week_start: PLANNER_WEEKDAY,
    day_start: CLOCK_TIME,
    day_end: CLOCK_TIME,
    working_hours: WORKING_HOURS,
    shown_profile_id: ID.nullable(),
  })
  .readonly();

const DAY_PLANNER = z
  .strictObject({
    fade: z.enum(PLANNER_FADE_STRENGTHS),
    show_happened: z.boolean(),
    show_sleep: z.boolean(),
    show_weather: z.boolean(),
    missed_scope: z.enum(PLANNER_MISSED_SCOPES),
  })
  .readonly();

const TASKS = z
  .strictObject({
    default_collection_id: ID.nullable(),
    smart_lists: z.array(z.enum(PLANNER_SMART_LISTS)).readonly(),
    suggest_completion: z.boolean(),
  })
  .readonly();

const CALENDAR = z
  .strictObject({
    default_view: z.enum(PLANNER_CALENDAR_VIEWS),
    default_reminders: PLANNER_REMINDERS,
    show_tasks: z.boolean(),
    show_alarms: z.boolean(),
    show_sleep: z.boolean(),
    show_free_time: z.boolean(),
  })
  .readonly();

const CLOCK = z
  .strictObject({
    sound: z.string().trim().min(1),
    ramp_seconds: z.int().nonnegative(),
    snooze_minutes: z.int().positive(),
    targets: PLANNER_RING_TARGETS,
    wake_scene_id: ID.nullable(),
    world_clocks: z.array(WORLD_CLOCK).readonly(),
  })
  .readonly();

const WATCH = z
  .strictObject({ watch_alarm_sync: z.boolean(), watch_calendar_push: z.boolean() })
  .readonly();

const AI = z
  .strictObject({
    briefing: z.enum(PLANNER_BRIEFINGS),
    evening_review: z.boolean(),
    plan_suggestions: z.boolean(),
  })
  .readonly();

export const PLANNER_PREFERENCES = z
  .strictObject({
    general: GENERAL,
    day_planner: DAY_PLANNER,
    tasks: TASKS,
    calendar: CALENDAR,
    clock: CLOCK,
    watch: WATCH,
    ai: AI,
  })
  .readonly();

export type PlannerPreferences = z.infer<typeof PLANNER_PREFERENCES>;

export const PLANNER_PREFERENCES_ROW = z
  .strictObject({
    profile_id: ID,
    preferences: PLANNER_PREFERENCES,
    updated_at: MOMENT,
  })
  .readonly();

export type PlannerPreferencesRow = z.infer<typeof PLANNER_PREFERENCES_ROW>;
