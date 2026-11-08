export const CLOCK_SECTIONS = ['index', 'timers', 'stopwatch', 'world'] as const;

export type ClockSection = (typeof CLOCK_SECTIONS)[number];

export const CLOCK_SECTION_ROUTES: readonly ClockSection[] = CLOCK_SECTIONS;
