import type { RouteDefinition } from '../../app-shell/route-types';
import { preloadAirHistory } from '../climate';

const hasClimate = (availability: { readonly hasClimate: boolean }): boolean =>
  availability.hasClimate;

export const ROUTES: readonly RouteDefinition[] = [
  {
    key: 'devices-air',
    href: '/devices/air',
    title: 'Air history',
    shortTitle: 'Air',
    icon: 'activity',
    tab: 'devices',
    parent: 'devices',
    keywords: [
      'air quality',
      'pm2.5',
      'pm10',
      'temperature',
      'humidity',
      'co2',
      'chart',
      'history',
      'climate',
    ],
    available: hasClimate,
    preload: preloadAirHistory,
    searchable: true,
  },
  {
    key: 'devices-supplies',
    href: '/devices/supplies',
    title: 'Filters & water',
    shortTitle: 'Supplies',
    icon: 'wrench',
    tab: 'devices',
    parent: 'devices',
    keywords: ['filter', 'water', 'tank', 'wick', 'maintenance', 'supplies', 'climate'],
    available: hasClimate,
    searchable: true,
  },
];
