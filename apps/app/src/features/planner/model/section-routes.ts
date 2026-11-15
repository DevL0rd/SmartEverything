export const PLANNER_SECTIONS = ['index', 'tasks', 'calendar', 'insights', 'booking'] as const;

export type PlannerSection = (typeof PLANNER_SECTIONS)[number];

export const PLANNER_SECTION_ROUTES: readonly PlannerSection[] = PLANNER_SECTIONS;
