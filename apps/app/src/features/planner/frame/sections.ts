import { href } from '../../../app-shell/hrefs';
import type { AppHref } from '../../../components/app-href';
import { frameLayoutMath } from '../../../components/frame-layout';
import type { IconName } from '../../../components/icon';
import type { PlannerSection } from '../model/section-routes';

export interface PlannerSectionDef {
  readonly id: PlannerSection;
  readonly label: string;
  readonly icon: IconName;
  readonly href: AppHref;
  readonly hint: string;
  readonly phoneTab: boolean;
}

export const PLANNER_QUICK_ADD_TARGET = 'planner' as const;

export const PLANNER_SECTION_DEFS: readonly PlannerSectionDef[] = [
  {
    id: 'index',
    label: 'Today',
    icon: 'sun',
    href: href.planner.index(),
    hint: 'Add to today. Try: dentist Tue 15:30 #family',
    phoneTab: true,
  },
  {
    id: 'tasks',
    label: 'Tasks',
    icon: 'circleCheck',
    href: href.planner.tasks(),
    hint: 'New task. Try: pay rent on the 1st !2',
    phoneTab: true,
  },
  {
    id: 'calendar',
    label: 'Calendar',
    icon: 'calendar',
    href: href.planner.calendar(),
    hint: 'New event. Try: dentist Tue 15:30',
    phoneTab: true,
  },
  {
    id: 'insights',
    label: 'Insights',
    icon: 'trendUp',
    href: href.planner.insights(),
    hint: 'Add a task or an event. Try: brush teeth every day 07:30 #health',
    phoneTab: false,
  },
];

class UnknownPlannerSection extends Error {
  constructor(section: string) {
    super(`The Planner has no section ${section}.`);
  }
}

export function plannerSectionOf(section: PlannerSection): PlannerSectionDef {
  const def = PLANNER_SECTION_DEFS.find((entry) => entry.id === section);
  if (def === undefined) throw new UnknownPlannerSection(section);
  return def;
}

export function isPlannerSection(id: string): id is PlannerSection {
  return PLANNER_SECTION_DEFS.some((entry) => entry.id === id);
}

export function plannerHrefOf(id: string): AppHref {
  if (!isPlannerSection(id)) throw new UnknownPlannerSection(id);
  return plannerSectionOf(id).href;
}

export const { frameLayoutOf, railWidthOf } = frameLayoutMath({
  compactMax: 600,
  iconRailMax: 900,
  wideRailMin: 1024,
});

export function plannerTitleOf(section: PlannerSection, area: number): string {
  return frameLayoutOf(area) === 'wide' && section !== 'index'
    ? plannerSectionOf(section).label
    : 'Planner';
}
