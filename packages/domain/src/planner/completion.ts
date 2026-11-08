import { z } from 'zod';
import { SIGNAL_MATCHER } from '../signal-matcher';

export const PLANNER_COMPLETION_WINDOWS = ['occurrence', 'day'] as const;

export type PlannerCompletionWindow = (typeof PLANNER_COMPLETION_WINDOWS)[number];

export const PLANNER_COMPLETION = z
  .discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('manual') }),
    z.strictObject({
      kind: z.literal('signal'),
      matcher: SIGNAL_MATCHER,
      window: z.enum(PLANNER_COMPLETION_WINDOWS),
    }),
  ])
  .readonly();

export type PlannerCompletion = z.infer<typeof PLANNER_COMPLETION>;
