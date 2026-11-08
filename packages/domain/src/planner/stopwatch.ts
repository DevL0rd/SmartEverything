import { z } from 'zod';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });

export const PLANNER_LAP = z
  .strictObject({
    elapsed_ms: z.int().nonnegative(),
    split_ms: z.int().nonnegative(),
  })
  .readonly();

export type PlannerLap = z.infer<typeof PLANNER_LAP>;

export const PLANNER_STOPWATCH_ROW = z
  .strictObject({
    id: ID,
    profile_id: ID,
    running: z.boolean(),
    started_at: MOMENT.nullable(),
    accumulated_ms: z.int().nonnegative(),
    laps: z.array(PLANNER_LAP).readonly(),
    updated_at: MOMENT,
  })
  .superRefine((row, context) => {
    if (row.running !== (row.started_at !== null)) {
      context.addIssue({
        code: 'custom',
        path: ['started_at'],
        message: 'a running stopwatch has its start instant and a stopped one has none',
      });
    }
  })
  .readonly();

export type PlannerStopwatchRow = z.infer<typeof PLANNER_STOPWATCH_ROW>;
