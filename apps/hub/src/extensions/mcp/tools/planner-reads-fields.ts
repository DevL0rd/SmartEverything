import {
  PLANNER_ITEM_KINDS,
  PLANNER_LOCAL_DATE,
  PLANNER_SEARCH_WHEN,
  PLANNER_STATS_RANGES,
} from '@smarteverything/domain';
import { z } from 'zod';
import { MOMENT_ARGUMENT } from './registry';

export const READ_FIELDS = {
  date: PLANNER_LOCAL_DATE,
  from: MOMENT_ARGUMENT,
  to: MOMENT_ARGUMENT,
  collections: z.array(z.uuid()).min(1),
  itemId: z.uuid(),
  range: z.enum(PLANNER_STATS_RANGES),
  minutes: z.int().positive(),
  text: z.string().trim().min(1),
  when: z.enum(PLANNER_SEARCH_WHEN),
  kinds: z.array(z.enum(PLANNER_ITEM_KINDS)).min(1),
  cursor: z.string().min(1),
} as const;
