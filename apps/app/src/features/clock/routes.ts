import type { RouteDefinition } from '../../app-shell/route-types';

interface PageSpec {
  readonly key: string;
  readonly path: 'timers' | 'stopwatch' | 'world';
  readonly title: string;
  readonly icon: RouteDefinition['icon'];
  readonly keywords: readonly string[];
}

function page({ key, path, title, icon, keywords }: PageSpec): RouteDefinition {
  return {
    key,
    href: `/clock/${path}`,
    title,
    icon,
    tab: 'clock',
    parent: 'clock',
    keywords,
    available: () => true,
    searchable: true,
  };
}

export const ROUTES: readonly RouteDefinition[] = [
  page({
    key: 'clock-timers',
    path: 'timers',
    title: 'Timers',
    icon: 'timer',
    keywords: ['countdown', 'kitchen timer', 'running timers'],
  }),
  page({
    key: 'clock-stopwatch',
    path: 'stopwatch',
    title: 'Stopwatch',
    icon: 'clock',
    keywords: ['laps', 'lap times', 'split'],
  }),
  page({
    key: 'clock-world',
    path: 'world',
    title: 'World clock',
    icon: 'globe',
    keywords: ['time zones', 'cities', 'time abroad'],
  }),
];
