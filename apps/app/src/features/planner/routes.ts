import type { RouteDefinition } from '../../app-shell/route-types';

interface PageSpec {
  readonly key: string;
  readonly path: 'tasks' | 'calendar' | 'insights';
  readonly title: string;
  readonly icon: RouteDefinition['icon'];
  readonly keywords: readonly string[];
}

function page({ key, path, title, icon, keywords }: PageSpec): RouteDefinition {
  return {
    key,
    href: `/planner/${path}`,
    title,
    icon,
    tab: 'planner',
    parent: 'planner',
    keywords,
    available: () => true,
    searchable: true,
  };
}

export const ROUTES: readonly RouteDefinition[] = [
  page({
    key: 'planner-tasks',
    path: 'tasks',
    title: 'Tasks',
    icon: 'circleCheck',
    keywords: ['to do', 'todo', 'lists', 'habits', 'due'],
  }),
  page({
    key: 'planner-calendar',
    path: 'calendar',
    title: 'Calendar',
    icon: 'calendar',
    keywords: ['events', 'week', 'month', 'appointments'],
  }),
  page({
    key: 'planner-insights',
    path: 'insights',
    title: 'Insights',
    icon: 'trendUp',
    keywords: ['stats', 'streaks', 'on time', 'trends'],
  }),
];
