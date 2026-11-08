import { z } from 'zod';
import { PLANNER_RING_TARGET } from './alarms';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });

export const PLANNER_RING_KINDS = ['alarm', 'timer', 'reminder'] as const;

export const PLANNER_RING_OUTCOMES = ['rang', 'missed'] as const;

export const PLANNER_MISSED_REASONS = ['hub_down', 'phone_off', 'computer_asleep'] as const;

export type PlannerMissedReason = (typeof PLANNER_MISSED_REASONS)[number];

export const PLANNER_RING_ROW = z
  .strictObject({
    id: ID,
    kind: z.enum(PLANNER_RING_KINDS),
    ref_id: ID,
    profile_id: ID,
    due_at: MOMENT,
    rang_at: MOMENT.nullable(),
    dismissed_at: MOMENT.nullable(),
    snoozes: z.int().nonnegative(),
    target: PLANNER_RING_TARGET.nullable(),
    outcome: z.enum(PLANNER_RING_OUTCOMES),
    missed_reason: z.enum(PLANNER_MISSED_REASONS).nullable(),
  })
  .superRefine((row, context) => {
    const missed = row.outcome === 'missed';
    if (missed !== (row.missed_reason !== null)) {
      context.addIssue({
        code: 'custom',
        path: ['missed_reason'],
        message: 'a missed ring has its reason and a ring that rang has none',
      });
    }
    if (missed && (row.rang_at !== null || row.dismissed_at !== null)) {
      context.addIssue({
        code: 'custom',
        path: ['rang_at'],
        message: 'a missed ring never rang',
      });
    }
    if (!missed && row.rang_at === null) {
      context.addIssue({
        code: 'custom',
        path: ['rang_at'],
        message: 'a ring that rang has its time',
      });
    }
  })
  .readonly();

export type PlannerRingRow = z.infer<typeof PLANNER_RING_ROW>;
