import { href } from '../../app-shell/hrefs';
import type { RouteDefinition } from '../../app-shell/route-types';

const always = (): boolean => true;

export const ROUTES: readonly RouteDefinition[] = [
  {
    key: 'automations.scenes',
    href: '/automations/scenes',
    title: 'Scenes',
    icon: 'sparkles',
    tab: 'automations',
    parent: 'automations',
    keywords: ['scene', 'mood', 'preset', 'movie', 'bedtime'],
    available: always,
    searchable: true,
    actions: [
      {
        key: 'new',
        title: 'New scene',
        icon: 'plus',
        href: href.scene('new'),
        keywords: ['create', 'add', 'make'],
      },
    ],
  },
  {
    key: 'automations.schedule',
    href: '/automations/schedule',
    title: 'Schedule',
    icon: 'calendar',
    tab: 'automations',
    parent: 'automations',
    keywords: ['timer', 'week', 'next', 'when'],
    available: always,
    searchable: true,
  },
  {
    key: 'automations.scheduled',
    href: '/automations/scheduled',
    title: 'Scheduled',
    icon: 'timer',
    tab: 'automations',
    parent: 'automations',
    keywords: [
      'timer',
      'later',
      'delay',
      'once',
      'countdown',
      'turn off in',
      'in minutes',
      'one-off',
    ],
    available: always,
    searchable: true,
    actions: [
      {
        key: 'new',
        title: 'Schedule an action',
        icon: 'plus',
        href: href.scheduledNew(),
        keywords: ['create', 'add', 'timer', 'later', 'delay'],
      },
    ],
  },
  {
    key: 'automations.runs',
    href: '/automations/runs',
    title: 'Run history',
    icon: 'activity',
    tab: 'automations',
    parent: 'automations',
    keywords: ['log', 'ran', 'failed', 'history'],
    available: always,
    searchable: true,
  },
];
