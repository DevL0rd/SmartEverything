import { z } from 'zod';
import { SIGNAL_MATCHER } from '../signal-matcher';

export const PLANNER_COMPLETION_WINDOWS = ['occurrence', 'day'] as const;

export type PlannerCompletionWindow = (typeof PLANNER_COMPLETION_WINDOWS)[number];

export const PLANNER_SIGNAL_COMPLETION = z
  .strictObject({
    kind: z.literal('signal'),
    matcher: SIGNAL_MATCHER,
    window: z.enum(PLANNER_COMPLETION_WINDOWS),
    minSeconds: z.number().int().positive().optional(),
  })
  .readonly();

export type PlannerSignalCompletion = z.infer<typeof PLANNER_SIGNAL_COMPLETION>;

export const PLANNER_COMPLETION = z
  .discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('manual') }),
    PLANNER_SIGNAL_COMPLETION,
  ])
  .readonly();

export type PlannerCompletion = z.infer<typeof PLANNER_COMPLETION>;
