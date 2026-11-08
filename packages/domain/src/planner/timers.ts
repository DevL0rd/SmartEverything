import { z } from 'zod';
import { PLANNER_RING_TARGETS } from './alarms';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });

export const PLANNER_TIMER_STATES = ['running', 'paused', 'done', 'cancelled'] as const;

export type PlannerTimerState = (typeof PLANNER_TIMER_STATES)[number];

export const PLANNER_TIMER_ROW = z
  .strictObject({
    id: ID,
    profile_id: ID,
    label: z.string().trim().min(1).nullable(),
    duration_ms: z.int().positive(),
    state: z.enum(PLANNER_TIMER_STATES),
    ends_at: MOMENT.nullable(),
    remaining_ms: z.int().nonnegative().nullable(),
    targets: PLANNER_RING_TARGETS,
    created_at: MOMENT,
    updated_at: MOMENT,
  })
  .superRefine((row, context) => {
    if (row.state === 'running' && (row.ends_at === null || row.remaining_ms !== null)) {
      context.addIssue({
        code: 'custom',
        path: ['ends_at'],
        message: 'a running timer has its end instant and no remaining time',
      });
    }
    if (row.state === 'paused' && (row.remaining_ms === null || row.ends_at !== null)) {
      context.addIssue({
        code: 'custom',
        path: ['remaining_ms'],
        message: 'a paused timer has its remaining time and no end instant',
      });
    }
  })
  .readonly();

export type PlannerTimerRow = z.infer<typeof PLANNER_TIMER_ROW>;
