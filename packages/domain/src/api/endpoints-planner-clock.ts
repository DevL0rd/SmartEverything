import { z } from 'zod';
import { CLOCK_TIME } from '../zoned-clock';
import { PLANNER_ALARM_ROW, PLANNER_DAYS, PLANNER_RING_TARGETS } from '../planner/alarms';
import { PLANNER_LOCAL_DATE } from '../planner/items';
import { PLANNER_RING_ROW } from '../planner/rings';
import { PLANNER_STOPWATCH_ROW } from '../planner/stopwatch';
import { PLANNER_TIMER_ROW } from '../planner/timers';
import { NO_BODY, endpoint } from './endpoint';
import { PLANNER_PERSON_QUERY } from './endpoints-planner-items';
import { DONE, ID, MOMENT, NOTHING, somethingToChange } from './primitives';

const ALARM_FIELDS = {
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
} as const;

export const PLANNER_ALARM_CREATE = z
  .strictObject({
    time: ALARM_FIELDS.time,
    label: ALARM_FIELDS.label.default(null),
    days: ALARM_FIELDS.days.default([]),
    once_on: ALARM_FIELDS.once_on.default(null),
    enabled: ALARM_FIELDS.enabled.default(true),
    sound: ALARM_FIELDS.sound.optional(),
    ramp_seconds: ALARM_FIELDS.ramp_seconds.optional(),
    vibrate: ALARM_FIELDS.vibrate.optional(),
    snooze_minutes: ALARM_FIELDS.snooze_minutes.optional(),
    smart_minutes: ALARM_FIELDS.smart_minutes.default(null),
    wake_scene_id: ALARM_FIELDS.wake_scene_id.default(null),
    wake_lead_minutes: ALARM_FIELDS.wake_lead_minutes.default(null),
    targets: ALARM_FIELDS.targets.optional(),
  })
  .refine((alarm) => alarm.once_on === null || alarm.days.length === 0, {
    path: ['once_on'],
    message: 'an alarm rings once on a date or on weekdays, not both',
  })
  .refine((alarm) => (alarm.wake_scene_id === null) === (alarm.wake_lead_minutes === null), {
    path: ['wake_lead_minutes'],
    message: 'a wake scene and its lead time are set together',
  });

export const PLANNER_ALARM_CHANGES = somethingToChange(ALARM_FIELDS);

const ALARM_PARAMS = z.strictObject({ alarmId: ID });

const TIMER_PARAMS = z.strictObject({ timerId: ID });

export const PLANNER_SNOOZE_BODY = z.strictObject({
  ringId: ID,
  minutes: z.int().positive().optional(),
});

export const PLANNER_DISMISS_BODY = z.strictObject({ ringId: ID });

export const PLANNER_TIMER_START = z.strictObject({
  duration_ms: z.int().positive(),
  label: z.string().trim().min(1).nullable().default(null),
  targets: PLANNER_RING_TARGETS.optional(),
});

export const PLANNER_ADD_TIME_BODY = z.strictObject({ ms: z.int().positive() });

export const PLANNER_RINGS_QUERY = z.strictObject({
  personId: ID.optional(),
  from: MOMENT,
  to: MOMENT,
});

export const PLANNER_PHONE_RINGS_QUERY = z.strictObject({
  personId: ID.optional(),
  clientId: ID,
});

export const PLANNER_PHONE_RING = z
  .strictObject({
    ringKey: z.string().min(1),
    kind: z.enum(['alarm', 'timer']),
    refId: ID,
    dueAt: MOMENT,
    sound: z.string().min(1),
    rampSeconds: z.int().nonnegative(),
    vibrate: z.boolean(),
    label: z.string().min(1).nullable(),
  })
  .readonly();

export const PLANNER_PHONE_RING_SET = z
  .strictObject({
    hash: z.string().min(1),
    rings: z.array(PLANNER_PHONE_RING).readonly(),
  })
  .readonly();

export type PlannerPhoneRingSet = z.infer<typeof PLANNER_PHONE_RING_SET>;

export const PLANNER_PHONE_RING_ACK = z.strictObject({
  clientId: ID,
  hash: z.string().min(1),
});

const ALARM_ACTIONS = {
  snoozePlannerAlarm: endpoint({
    method: 'POST',
    path: '/api/planner/alarms/:alarmId/snooze',
    access: 'member',
    summary: 'Snooze a ringing alarm',
    params: ALARM_PARAMS,
    query: PLANNER_PERSON_QUERY,
    body: PLANNER_SNOOZE_BODY,
    response: PLANNER_RING_ROW,
  }),
  dismissPlannerAlarm: endpoint({
    method: 'POST',
    path: '/api/planner/alarms/:alarmId/dismiss',
    access: 'member',
    summary: 'Dismiss a ringing alarm',
    params: ALARM_PARAMS,
    query: PLANNER_PERSON_QUERY,
    body: PLANNER_DISMISS_BODY,
    response: PLANNER_RING_ROW,
  }),
  skipNextPlannerAlarm: endpoint({
    method: 'POST',
    path: '/api/planner/alarms/:alarmId/skip-next',
    access: 'member',
    summary: 'Skip the next ring of a repeating alarm',
    params: ALARM_PARAMS,
    query: PLANNER_PERSON_QUERY,
    body: NO_BODY,
    response: PLANNER_ALARM_ROW,
  }),
} as const;

const TIMER_ACTIONS = {
  startPlannerTimer: endpoint({
    method: 'POST',
    path: '/api/planner/timers',
    access: 'member',
    summary: 'Start a timer',
    params: NOTHING,
    query: PLANNER_PERSON_QUERY,
    body: PLANNER_TIMER_START,
    response: PLANNER_TIMER_ROW,
  }),
  pausePlannerTimer: endpoint({
    method: 'POST',
    path: '/api/planner/timers/:timerId/pause',
    access: 'member',
    summary: 'Pause a running timer',
    params: TIMER_PARAMS,
    query: PLANNER_PERSON_QUERY,
    body: NO_BODY,
    response: PLANNER_TIMER_ROW,
  }),
  resumePlannerTimer: endpoint({
    method: 'POST',
    path: '/api/planner/timers/:timerId/resume',
    access: 'member',
    summary: 'Resume a paused timer',
    params: TIMER_PARAMS,
    query: PLANNER_PERSON_QUERY,
    body: NO_BODY,
    response: PLANNER_TIMER_ROW,
  }),
  addPlannerTimerTime: endpoint({
    method: 'POST',
    path: '/api/planner/timers/:timerId/add-time',
    access: 'member',
    summary: 'Add time to a timer',
    params: TIMER_PARAMS,
    query: PLANNER_PERSON_QUERY,
    body: PLANNER_ADD_TIME_BODY,
    response: PLANNER_TIMER_ROW,
  }),
  cancelPlannerTimer: endpoint({
    method: 'POST',
    path: '/api/planner/timers/:timerId/cancel',
    access: 'member',
    summary: 'Cancel a timer',
    params: TIMER_PARAMS,
    query: PLANNER_PERSON_QUERY,
    body: NO_BODY,
    response: PLANNER_TIMER_ROW,
  }),
} as const;

const STOPWATCH_ACTION = {
  method: 'POST',
  access: 'member',
  params: NOTHING,
  query: PLANNER_PERSON_QUERY,
  body: NO_BODY,
  response: PLANNER_STOPWATCH_ROW,
} as const;

export const PLANNER_CLOCK_ENDPOINTS = {
  createPlannerAlarm: endpoint({
    method: 'POST',
    path: '/api/planner/alarms',
    access: 'member',
    summary: 'Add an alarm',
    params: NOTHING,
    query: PLANNER_PERSON_QUERY,
    body: PLANNER_ALARM_CREATE,
    response: PLANNER_ALARM_ROW,
  }),
  updatePlannerAlarm: endpoint({
    method: 'PATCH',
    path: '/api/planner/alarms/:alarmId',
    access: 'member',
    summary: 'Change an alarm',
    params: ALARM_PARAMS,
    query: PLANNER_PERSON_QUERY,
    body: PLANNER_ALARM_CHANGES,
    response: PLANNER_ALARM_ROW,
  }),
  deletePlannerAlarm: endpoint({
    method: 'DELETE',
    path: '/api/planner/alarms/:alarmId',
    access: 'member',
    summary: 'Delete an alarm',
    params: ALARM_PARAMS,
    query: PLANNER_PERSON_QUERY,
    body: NO_BODY,
    response: DONE,
  }),
  ...ALARM_ACTIONS,
  ...TIMER_ACTIONS,
  startPlannerStopwatch: endpoint({
    ...STOPWATCH_ACTION,
    path: '/api/planner/stopwatch/start',
    summary: 'Start or continue the stopwatch',
  }),
  pausePlannerStopwatch: endpoint({
    ...STOPWATCH_ACTION,
    path: '/api/planner/stopwatch/pause',
    summary: 'Pause the stopwatch',
  }),
  lapPlannerStopwatch: endpoint({
    ...STOPWATCH_ACTION,
    path: '/api/planner/stopwatch/lap',
    summary: 'Record a lap',
  }),
  resetPlannerStopwatch: endpoint({
    ...STOPWATCH_ACTION,
    path: '/api/planner/stopwatch/reset',
    summary: 'Reset the stopwatch and clear its laps',
  }),
  listPlannerRings: endpoint({
    method: 'GET',
    path: '/api/planner/rings',
    access: 'member',
    summary: 'Alarm, timer and reminder rings between two moments, with what happened to each',
    params: NOTHING,
    query: PLANNER_RINGS_QUERY,
    body: NO_BODY,
    response: z.array(PLANNER_RING_ROW),
  }),
  readPlannerPhoneRings: endpoint({
    method: 'GET',
    path: '/api/planner/phone-rings',
    access: 'member',
    summary: 'The set of rings a phone must schedule on its own',
    params: NOTHING,
    query: PLANNER_PHONE_RINGS_QUERY,
    body: NO_BODY,
    response: PLANNER_PHONE_RING_SET,
  }),
  ackPlannerPhoneRings: endpoint({
    method: 'POST',
    path: '/api/planner/phone-rings/ack',
    access: 'member',
    summary: 'A phone confirms it scheduled the ring set with this hash',
    params: NOTHING,
    query: PLANNER_PERSON_QUERY,
    body: PLANNER_PHONE_RING_ACK,
    response: DONE,
  }),
} as const;
