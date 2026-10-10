import type { RouteDefinition } from '../../app-shell/route-types';

export const ROUTES: readonly RouteDefinition[] = [
  {
    key: 'activity',
    href: '/activity',
    title: 'Activity',
    icon: 'activity',
    tab: 'home',
    parent: 'home',
    keywords: ['history', 'log', 'events', 'changes', 'recent'],
    available: (availability) => availability.hasDevices,
    searchable: true,
  },
];
