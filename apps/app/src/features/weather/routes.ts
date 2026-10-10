import type { RouteDefinition } from '../../app-shell/route-types';

export const ROUTES: readonly RouteDefinition[] = [
  {
    key: 'weather',
    href: '/weather',
    title: 'Weather',
    icon: 'weather',
    tab: 'home',
    parent: 'home',
    keywords: [
      'weather',
      'forecast',
      'rain',
      'temperature outside',
      'outdoor',
      'air quality',
      'aqi',
      'uv',
      'pollen',
      'sunrise',
      'sunset',
      'wind',
    ],
    available: () => true,
    searchable: true,
  },
];
