import { z } from 'zod';
import { CLOCK_TIME } from './zoned-clock';
import { PLUGIN_ORIGIN } from './plugin-people';
import { JSON_VALUE } from './values';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });
const DAY_SECONDS = 86_400;

export const SCHEDULE_LIMITS = {
  steps: 50,
  occurrences: 100,
  waitSeconds: 7 * DAY_SECONDS,
  horizonSeconds: 366 * DAY_SECONDS,
  shortestEverySeconds: 10,
  results: 200,
  keepFinishedDays: 7,
  label: 80,
  prompt: 4000,
  lateAfterMs: 60_000,
} as const;

const STOP_ON_FAILURE = z
  .boolean()
  .default(false)
  .describe('Stop the remaining steps of this run when this step fails');

export const SCHEDULE_STEP = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('tool'),
    tool: z.string().trim().min(1).max(200).describe('Any tool name, as the AI tools list it'),
    args: z.record(z.string(), JSON_VALUE).default({}).describe('The tool’s arguments'),
    stopOnFailure: STOP_ON_FAILURE,
  }),
  z.strictObject({
    kind: z.literal('ai'),
    prompt: z.string().trim().min(1).max(SCHEDULE_LIMITS.prompt).describe('What the AI should do'),
    chatId: ID.nullable().default(null).describe('The chat to run it in; null starts a new chat'),
    stopOnFailure: STOP_ON_FAILURE,
  }),
  z.strictObject({
    kind: z.literal('wait'),
    seconds: z.int().min(1).max(SCHEDULE_LIMITS.waitSeconds),
  }),
]);

export type ScheduleStep = z.output<typeof SCHEDULE_STEP>;

export type ScheduleStepInput = z.input<typeof SCHEDULE_STEP>;

export const SCHEDULE_STEPS = z.array(SCHEDULE_STEP).min(1).max(SCHEDULE_LIMITS.steps);

const SECONDS_AHEAD = z.int().min(1).max(SCHEDULE_LIMITS.horizonSeconds);

export const SCHEDULE_TIMING = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('at'),
    at: z
      .union([MOMENT, CLOCK_TIME])
      .describe('A moment with its offset, or HH:MM for the next such time at home'),
  }),
  z.strictObject({ kind: z.literal('in'), seconds: SECONDS_AHEAD }),
  z.strictObject({
    kind: z.literal('series'),
    everySeconds: z
      .int()
      .min(SCHEDULE_LIMITS.shortestEverySeconds)
      .max(SCHEDULE_LIMITS.horizonSeconds),
    count: z.int().min(1).max(SCHEDULE_LIMITS.occurrences),
    startAt: MOMENT.nullable()
      .default(null)
      .describe('First run; null means one interval from now'),
  }),
  z.strictObject({
    kind: z.literal('times'),
    times: z.array(MOMENT).min(1).max(SCHEDULE_LIMITS.occurrences),
  }),
]);

export type ScheduleTiming = z.output<typeof SCHEDULE_TIMING>;

export type ScheduleTimingInput = z.input<typeof SCHEDULE_TIMING>;

export const SCHEDULE_STATES = [
  'scheduled',
  'running',
  'waiting',
  'done',
  'failed',
  'cancelled',
] as const;

export type ScheduleState = (typeof SCHEDULE_STATES)[number];

export const SCHEDULE_STATE = z.enum(SCHEDULE_STATES);

export const ACTIVE_SCHEDULE_STATES: ReadonlySet<ScheduleState> = new Set([
  'scheduled',
  'running',
  'waiting',
]);

export function isScheduleActive(state: ScheduleState): boolean {
  return ACTIVE_SCHEDULE_STATES.has(state);
}

export const SCHEDULE_OUTCOMES = ['ok', 'failed', 'interrupted', 'missed'] as const;

export type ScheduleOutcome = (typeof SCHEDULE_OUTCOMES)[number];

export const SCHEDULE_RESULT = z.strictObject({
  occurrence: z.int().min(0),
  step: z.int().min(-1),
  at: MOMENT,
  outcome: z.enum(SCHEDULE_OUTCOMES),
  line: z.string().max(400),
  detail: z.string().max(1000).nullable(),
  late_ms: z.int().min(0),
});

export type ScheduleResult = z.infer<typeof SCHEDULE_RESULT>;

export const SCHEDULE_VIA = z.enum(['app', 'assistant']);

export const SCHEDULE_LABEL = z.string().trim().min(1).max(SCHEDULE_LIMITS.label);

export const SCHEDULE_ROW = z.strictObject({
  id: ID,
  profile_id: ID,
  client_id: ID.nullable(),
  via: SCHEDULE_VIA,
  label: SCHEDULE_LABEL.nullable(),
  timing: SCHEDULE_TIMING,
  occurrences: z.array(MOMENT).min(1).max(SCHEDULE_LIMITS.occurrences),
  steps: SCHEDULE_STEPS,
  step_lines: z.array(z.string().max(400).nullable()),
  device_ids: z.array(ID),
  state: SCHEDULE_STATE,
  next_at: MOMENT.nullable(),
  occurrence: z.int().min(0),
  step: z.int().min(0),
  results: z.array(SCHEDULE_RESULT).max(SCHEDULE_LIMITS.results),
  confirmed_at: MOMENT.nullable(),
  confirmed_by: ID.nullable(),
  origin: PLUGIN_ORIGIN.nullable(),
  created_at: MOMENT,
  updated_at: MOMENT,
  finished_at: MOMENT.nullable(),
});

export type ScheduleRow = z.infer<typeof SCHEDULE_ROW>;
