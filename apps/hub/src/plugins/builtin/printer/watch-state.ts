import { z } from 'zod';
import { PRINTER_PROBLEM_DETAIL } from '@smarteverything/domain';

const TRACKED_PROBLEM = z.strictObject({
  keyword: PRINTER_PROBLEM_DETAIL.shape.keyword,
  severity: PRINTER_PROBLEM_DETAIL.shape.severity,
  part: PRINTER_PROBLEM_DETAIL.shape.part,
  title: z.string(),
  cause: z.string(),
});

export const WATCH_STATE = z.strictObject({
  problems: z.array(TRACKED_PROBLEM).default([]),
  problemAnnouncedAt: z.record(z.string(), z.number()).default({}),
  levels: z.record(z.string(), z.number().nullable()).default({}),
  armed: z.record(z.string(), z.boolean()).default({}),
  supplyAnnouncedAt: z.record(z.string(), z.number()).default({}),
  alerts: z.array(z.string()).default([]),
});

export type WatchState = z.infer<typeof WATCH_STATE>;

export function emptyWatch(): WatchState {
  return WATCH_STATE.parse({});
}
