import { z } from 'zod';
import { SIGNAL_INPUT } from '../signals';
import { PLANNER_COMPLETERS, PLANNER_OCCURRENCE_KEY } from './occurrences';
import { PLANNER_RING_KINDS } from './rings';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });

export const PLANNER_SIGNAL_SOURCE = 'planner';

export const PLANNER_SIGNAL_KINDS = [
  'task_due',
  'task_missed',
  'task_done',
  'alarm_rang',
  'alarm_dismissed',
  'alarm_snoozed',
  'timer_done',
  'event_starting',
] as const;

export type PlannerSignalKind = (typeof PLANNER_SIGNAL_KINDS)[number];

const TASK_DATA = z.strictObject({
  itemId: ID,
  occurrenceKey: PLANNER_OCCURRENCE_KEY,
  title: z.string().min(1),
  dueAt: MOMENT.nullable(),
});

const ALARM_DATA = z.strictObject({
  alarmId: ID,
  ringId: ID,
  label: z.string().min(1).nullable(),
  dueAt: MOMENT,
});

const BASE = {
  ...SIGNAL_INPUT.shape,
  source: z.literal(PLANNER_SIGNAL_SOURCE),
  subject: ID,
  field: z.null(),
};

const TASK_DONE_DATA = TASK_DATA.extend({ completedBy: z.enum(PLANNER_COMPLETERS) });

const ALARM_SNOOZED_DATA = ALARM_DATA.extend({ snoozes: z.int().positive(), until: MOMENT });

const TIMER_DATA = z.strictObject({
  timerId: ID,
  label: z.string().min(1).nullable(),
  durationMs: z.int().positive(),
});

const EVENT_DATA = z.strictObject({
  itemId: ID,
  occurrenceKey: PLANNER_OCCURRENCE_KEY,
  title: z.string().min(1),
  startsAt: MOMENT,
  minutesBefore: z.int().nonnegative(),
});

export const PLANNER_SIGNAL = z.discriminatedUnion('kind', [
  z.strictObject({ ...BASE, kind: z.literal('task_due'), data: TASK_DATA }),
  z.strictObject({ ...BASE, kind: z.literal('task_missed'), data: TASK_DATA }),
  z.strictObject({ ...BASE, kind: z.literal('task_done'), data: TASK_DONE_DATA }),
  z.strictObject({ ...BASE, kind: z.literal('alarm_rang'), data: ALARM_DATA }),
  z.strictObject({ ...BASE, kind: z.literal('alarm_dismissed'), data: ALARM_DATA }),
  z.strictObject({ ...BASE, kind: z.literal('alarm_snoozed'), data: ALARM_SNOOZED_DATA }),
  z.strictObject({ ...BASE, kind: z.literal('timer_done'), data: TIMER_DATA }),
  z.strictObject({ ...BASE, kind: z.literal('event_starting'), data: EVENT_DATA }),
]);

export type PlannerSignal = z.infer<typeof PLANNER_SIGNAL>;

export const PLANNER_RING_NOTICE = z.strictObject({
  type: z.literal('planner_ring'),
  ringId: ID,
  kind: z.enum(PLANNER_RING_KINDS),
  refId: ID,
  dueAt: MOMENT,
});

export type PlannerRingNotice = z.infer<typeof PLANNER_RING_NOTICE>;
