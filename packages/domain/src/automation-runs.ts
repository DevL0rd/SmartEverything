import { z } from 'zod';

export const AUTOMATION_RUN_HISTORY_LIMIT = 200;
export const AUTOMATION_RUNS_KEPT = 100;
export const MAX_AUTOMATION_QUEUE = 100;
export const MAX_AUTOMATION_PARALLEL = 32;
export const AUTOMATION_RUN_ID = z.uuid().brand<'AutomationRunId'>();
export const AUTOMATION_RUN_POLICY = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('single') }),
  z.strictObject({ mode: z.literal('restart') }),
  z.strictObject({ mode: z.literal('queue'), limit: z.int().min(1).max(MAX_AUTOMATION_QUEUE) }),
  z.strictObject({
    mode: z.literal('parallel'),
    limit: z.int().min(1).max(MAX_AUTOMATION_PARALLEL),
  }),
]);
export type AutomationRunPolicy = z.infer<typeof AUTOMATION_RUN_POLICY>;
