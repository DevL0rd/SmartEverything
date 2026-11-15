import { z } from 'zod';
import { PLANNER_LOCAL_DATE } from './items';

const MOMENT = z.iso.datetime({ offset: true });

export const PLANNER_SLEEP_NIGHT = z
  .strictObject({
    date: PLANNER_LOCAL_DATE,
    bed_at: MOMENT,
    woke_at: MOMENT,
    asleep_minutes: z.int().nonnegative(),
  })
  .refine((night) => Date.parse(night.bed_at) < Date.parse(night.woke_at), {
    path: ['woke_at'],
    message: 'a night ends after it starts',
  })
  .readonly();

export type PlannerSleepNight = z.infer<typeof PLANNER_SLEEP_NIGHT>;

export const PLANNER_SLEEP = z
  .strictObject({
    nights: z.array(PLANNER_SLEEP_NIGHT).readonly(),
    week_average_minutes: z.int().nonnegative().nullable(),
  })
  .readonly();

export type PlannerSleep = z.infer<typeof PLANNER_SLEEP>;
