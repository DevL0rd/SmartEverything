import { z } from 'zod';
import { WATCH_SPORT } from './watch-workouts';

const KEY = z.string().regex(/^[a-z][a-z0-9_.]{0,59}$/);
const LABEL = z.string().min(1).max(80);
const CLOCK = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const SETTING_BASE = {
  key: KEY,
  section: LABEL,
  label: LABEL,
  description: z.string().max(200).nullable(),
};

export const WATCH_SETTING = z.discriminatedUnion('kind', [
  z.strictObject({ ...SETTING_BASE, kind: z.literal('switch'), value: z.boolean() }),
  z.strictObject({
    ...SETTING_BASE,
    kind: z.literal('choice'),
    value: z.string().min(1).max(40),
    options: z
      .array(z.strictObject({ value: z.string().min(1).max(40), label: LABEL }))
      .min(2)
      .max(40),
  }),
  z.strictObject({
    ...SETTING_BASE,
    kind: z.literal('number'),
    value: z.number(),
    min: z.number(),
    max: z.number(),
    step: z.number().positive(),
    unit: z.string().max(12).nullable(),
  }),
  z.strictObject({ ...SETTING_BASE, kind: z.literal('time'), value: CLOCK }),
]);

export type WatchSetting = z.infer<typeof WATCH_SETTING>;

export const WATCH_SETTING_VALUE = z.union([z.boolean(), z.number(), z.string().min(1).max(40)]);

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export const WATCH_ALARM = z.strictObject({
  id: z.int().min(0).nullable(),
  time: CLOCK,
  enabled: z.boolean(),
  days: z.array(z.enum(WEEKDAYS)).max(7),
  smart: z.boolean(),
});

export type WatchAlarm = z.infer<typeof WATCH_ALARM>;

export const WATCH_FACE = z.strictObject({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(120),
  active: z.boolean(),
  removable: z.boolean(),
});

export type WatchFace = z.infer<typeof WATCH_FACE>;

export const WATCH_ACTION = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('find_watch'), on: z.boolean() }),
  z.strictObject({ type: z.literal('sync') }),
  z.strictObject({ type: z.literal('refresh') }),
  z.strictObject({ type: z.literal('set_setting'), key: KEY, value: WATCH_SETTING_VALUE }),
  z.strictObject({ type: z.literal('save_alarm'), alarm: WATCH_ALARM }),
  z.strictObject({ type: z.literal('delete_alarm'), id: z.int().min(0) }),
  z.strictObject({ type: z.literal('set_watch_face'), id: WATCH_FACE.shape.id }),
  z.strictObject({ type: z.literal('delete_watch_face'), id: WATCH_FACE.shape.id }),
  z.strictObject({ type: z.literal('start_workout'), sport: WATCH_SPORT }),
  z.strictObject({ type: z.literal('pause_workout') }),
  z.strictObject({ type: z.literal('resume_workout') }),
  z.strictObject({ type: z.literal('stop_workout') }),
]);

export type WatchActionRequest = z.infer<typeof WATCH_ACTION>;

export const WATCH_ACTION_RESULT = z.strictObject({
  ok: z.boolean(),
  detail: z.string().max(400),
});

export type WatchActionResult = z.infer<typeof WATCH_ACTION_RESULT>;

export const WATCH_ACTION_ANSWER = WATCH_ACTION_RESULT.extend({ requestId: z.uuid() });

export const WATCH_ACTION_NOTICE = z.strictObject({
  type: z.literal('watch_action'),
  requestId: z.uuid(),
  deviceId: z.uuid(),
  action: WATCH_ACTION,
});

export type WatchActionNotice = z.infer<typeof WATCH_ACTION_NOTICE>;

export const WATCH_GOAL_KEYS = ['steps', 'move_kcal', 'active_minutes', 'standing_hours'] as const;

export const WATCH_GOAL = z.strictObject({
  key: z.enum(WATCH_GOAL_KEYS),
  sent: z.int().min(0).nullable(),
  reported: z.int().min(0).nullable(),
  shown: z.boolean().nullable(),
});

export type WatchGoal = z.infer<typeof WATCH_GOAL>;

export const WATCH_CONFIG = z.strictObject({
  settings: z.array(WATCH_SETTING).max(200),
  alarms: z.array(WATCH_ALARM).max(30),
  faces: z.array(WATCH_FACE).max(100),
  goals: z.array(WATCH_GOAL).max(WATCH_GOAL_KEYS.length).default([]),
  sports: z.array(WATCH_SPORT).max(WATCH_SPORT.options.length).default([]),
});

export type WatchConfig = z.infer<typeof WATCH_CONFIG>;

export const WATCH_CALENDAR_LIMIT = 50;

export const WATCH_CALENDAR_EVENT = z.strictObject({
  title: z.string().min(1).max(60),
  description: z.string().max(120),
  location: z.string().max(60),
  start: z.int().min(0),
  end: z.int().min(0),
  allDay: z.boolean(),
  remindMinutes: z.int().min(0).max(40_320).nullable(),
});

export type WatchCalendarEvent = z.infer<typeof WATCH_CALENDAR_EVENT>;

export const WATCH_CALENDAR = z.array(WATCH_CALENDAR_EVENT).max(WATCH_CALENDAR_LIMIT);

export const WATCH_CONFIG_REPORT = z.strictObject({
  deviceId: z.uuid(),
  name: z.string().min(1),
  phase: z.string().nullable(),
  battery: z.int().min(0).max(100).nullable(),
  reportedAt: z.iso.datetime({ offset: true }).nullable(),
  config: WATCH_CONFIG,
});

export type WatchConfigReport = z.infer<typeof WATCH_CONFIG_REPORT>;
