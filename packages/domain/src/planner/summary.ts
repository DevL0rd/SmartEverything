import { z } from 'zod';

const COUNT = z.int().nonnegative();

const SUMMARY_FIELDS = {
  personId: z.uuid(),
  missed: COUNT,
  left: COUNT,
  nextAlarmAt: z.iso.datetime({ offset: true }).nullable(),
  runningTimers: COUNT,
} as const;

export const PLANNER_SUMMARY = z.strictObject(SUMMARY_FIELDS).readonly();

export type PlannerSummary = z.infer<typeof PLANNER_SUMMARY>;

export const PLANNER_SUMMARY_NOTICE = z.strictObject({
  type: z.literal('planner_summary'),
  ...SUMMARY_FIELDS,
});

export type PlannerSummaryNotice = z.infer<typeof PLANNER_SUMMARY_NOTICE>;
