import { z } from 'zod';
import { PLANNER_OCCURRENCE_VIEW } from './range';

export const PLANNER_SEARCH_WHEN = ['all', 'upcoming', 'past'] as const;

export const PLANNER_SEARCH_FIELDS = ['title', 'notes', 'location', 'guest', 'calendar'] as const;

export type PlannerSearchField = (typeof PLANNER_SEARCH_FIELDS)[number];

export const PLANNER_SEARCH_HIT = z
  .strictObject({
    occurrence: PLANNER_OCCURRENCE_VIEW,
    reading: z.enum(['next', 'last']),
    matched: z.array(z.enum(PLANNER_SEARCH_FIELDS)).min(1).readonly(),
  })
  .readonly();

export type PlannerSearchHit = z.infer<typeof PLANNER_SEARCH_HIT>;

export const PLANNER_SEARCH_PAGE = z
  .strictObject({
    hits: z.array(PLANNER_SEARCH_HIT).readonly(),
    next: z.string().min(1).nullable(),
  })
  .readonly();

export type PlannerSearchPage = z.infer<typeof PLANNER_SEARCH_PAGE>;
