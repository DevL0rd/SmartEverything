import { z } from 'zod';
import {
  SCHEDULE_LABEL,
  SCHEDULE_ROW,
  SCHEDULE_STATE,
  SCHEDULE_STEPS,
  SCHEDULE_TIMING,
} from '../schedules';
import { NO_BODY, endpoint } from './endpoint';
import { DONE, ID, NOTHING } from './primitives';

const SCHEDULE_PARAMS = z.strictObject({ scheduleId: ID });

const CONFIRM = z
  .boolean()
  .default(false)
  .describe('true once the person has confirmed the steps that need it');

export const SCHEDULE_NEEDS_CONFIRMATION = z.strictObject({
  outcome: z.literal('needs_confirmation'),
  reason: z.string(),
  steps: z.array(z.strictObject({ index: z.int().min(0), line: z.string() })).min(1),
});

export const SCHEDULE_SAVED = z.discriminatedUnion('outcome', [
  z.strictObject({ outcome: z.literal('scheduled'), schedule: SCHEDULE_ROW }),
  SCHEDULE_NEEDS_CONFIRMATION,
]);

export type ScheduleSaved = z.infer<typeof SCHEDULE_SAVED>;

const STEPS_TEXT =
  "steps run in order: {kind:'tool', tool, args} calls any tool by its name with its arguments; " +
  "{kind:'ai', prompt, chatId?} runs one AI turn; {kind:'wait', seconds} pauses";

const TIMING_TEXT =
  "timing: {kind:'in', seconds}, {kind:'at', at} (a moment with offset, or HH:MM at home), " +
  "{kind:'series', everySeconds, count, startAt?} or {kind:'times', times[]}";

export const SCHEDULE_ENDPOINTS = {
  listSchedules: endpoint({
    method: 'GET',
    path: '/api/scheduled',
    access: 'member',
    summary: 'One-off scheduled actions, soonest first, with each step’s results',
    params: NOTHING,
    query: z.strictObject({ deviceId: ID.optional(), state: SCHEDULE_STATE.optional() }),
    body: NO_BODY,
    response: z.array(SCHEDULE_ROW),
  }),
  createSchedule: endpoint({
    method: 'POST',
    path: '/api/scheduled',
    access: 'member',
    summary: `Schedule one-off steps for later (“turn the fan off in 4 minutes”); ${TIMING_TEXT}; ${STEPS_TEXT}. Steps that need confirmation are listed back until confirm is true`,
    params: NOTHING,
    query: NOTHING,
    body: z.strictObject({
      label: SCHEDULE_LABEL.nullable().default(null),
      timing: SCHEDULE_TIMING,
      steps: SCHEDULE_STEPS,
      confirm: CONFIRM,
    }),
    response: SCHEDULE_SAVED,
  }),
  updateSchedule: endpoint({
    method: 'PATCH',
    path: '/api/scheduled/:scheduleId',
    access: 'member',
    summary: `Change a scheduled action that has not finished: label, timing (counted from now) or steps; ${STEPS_TEXT}`,
    params: SCHEDULE_PARAMS,
    query: NOTHING,
    body: z
      .strictObject({
        label: SCHEDULE_LABEL.nullable().optional(),
        timing: SCHEDULE_TIMING.optional(),
        steps: SCHEDULE_STEPS.optional(),
        confirm: CONFIRM,
      })
      .refine(
        (change) =>
          change.label !== undefined || change.timing !== undefined || change.steps !== undefined,
        { message: 'name the label, timing or steps to change' },
      ),
    response: SCHEDULE_SAVED,
  }),
  cancelSchedule: endpoint({
    method: 'POST',
    path: '/api/scheduled/:scheduleId/cancel',
    access: 'member',
    summary: 'Cancel a scheduled action; a run in progress stops before its next step',
    params: SCHEDULE_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: SCHEDULE_ROW,
  }),
  runSchedule: endpoint({
    method: 'POST',
    path: '/api/scheduled/:scheduleId/run',
    access: 'member',
    summary:
      'Run a scheduled action now instead of waiting, or with step run that one step again once',
    params: SCHEDULE_PARAMS,
    query: NOTHING,
    body: z.strictObject({ step: z.int().min(0).optional() }),
    response: SCHEDULE_ROW,
  }),
  removeSchedule: endpoint({
    method: 'DELETE',
    path: '/api/scheduled/:scheduleId',
    access: 'member',
    summary: 'Remove a finished or cancelled scheduled action from the list',
    params: SCHEDULE_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
} as const;
