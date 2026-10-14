import { ROUTES as AUTOMATIONS } from '../features/automations/routes';
import { ROUTES as CAMERAS, preloadCameras } from '../features/cameras/routes';
import { ROUTES as CONNECTIONS } from '../features/connections/routes';
import { ROUTES as DEVICE_LIST } from '../features/device-list/routes';
import { ROUTES as DEVICES } from '../features/devices/routes';
import { ROUTES as FITNESS } from '../features/fitness/routes';
import { ROUTES as HOME } from '../features/home/routes';
import { ROUTES as NUTRITION } from '../features/nutrition/routes';
import { ROUTES as SETTINGS } from '../features/settings/routes';
import { talkAvailable } from '../features/talk';
import { ROUTES as WEATHER } from '../features/weather/routes';
import { href } from './hrefs';
import type { PreloadContext, RouteDefinition } from './route-types';

export type { RouteDefinition } from './route-types';

const always = (): boolean => true;

export const TAB_ROUTES: readonly RouteDefinition[] = [
  {
    key: 'home',
    href: '/',
    title: 'Home',
    icon: 'home',
    tab: 'home',
    parent: null,
    keywords: ['overview', 'dashboard'],
    available: always,
    searchable: true,
  },
  {
    key: 'devices',
    href: '/devices',
    title: 'Devices',
    icon: 'bulb',
    tab: 'devices',
    parent: null,
    keywords: [
      'all devices',
      'list',
      'offline',
      'rooms',
      'climate',
      'air',
      'temperature',
      'humidity',
      'purifier',
    ],
    available: always,
    searchable: true,
    actions: [
      {
        key: 'add',
        title: 'Add a device',
        icon: 'plus',
        href: href.settings.page('devices/add'),
        keywords: ['pair', 'connect', 'new device', 'set up'],
        ownerOnly: true,
      },
    ],
  },
  {
    key: 'cameras',
    href: '/cameras',
    title: 'Cameras',
    icon: 'cameras',
    tab: 'cameras',
    parent: null,
    keywords: ['video', 'live', 'doorbell'],
    available: (a) => a.hasCameras,
    preload: preloadCameras,
    searchable: true,
  },
  {
    key: 'fitness',
    href: '/fitness',
    title: 'Fitness',
    icon: 'fitness',
    tab: 'fitness',
    parent: null,
    keywords: ['health', 'steps', 'sleep', 'heart'],
    available: (a) => a.hasHealth,
    searchable: true,
  },
  {
    key: 'automations',
    href: '/automations',
    title: 'Automations',
    icon: 'automations',
    tab: 'automations',
    parent: null,
    keywords: ['rules', 'schedules', 'scenes'],
    available: always,
    searchable: true,
    actions: [
      {
        key: 'new',
        title: 'New automation',
        icon: 'plus',
        href: href.automation('new'),
        keywords: ['create', 'add', 'rule', 'make'],
      },
    ],
  },
  {
    key: 'assistant',
    href: '/assistant',
    title: 'Assistant',
    shortTitle: 'AI',
    icon: 'sparkles',
    tab: 'assistant',
    parent: null,
    keywords: ['ai', 'chat', 'ask', 'claude', 'coordinator', 'assistant'],
    available: always,
    searchable: true,
    actions: [
      {
        key: 'new-chat',
        title: 'New chat',
        icon: 'pencil',
        href: href.assistantChat('new'),
        keywords: ['start', 'ask', 'conversation', 'compose', 'message', 'write'],
      },
      {
        key: 'call',
        title: 'Call the assistant',
        icon: 'phone',
        href: href.assistantCall('palette'),
        keywords: ['voice', 'talk', 'speak', 'ring', 'phone call', 'coordinator'],
      },
      {
        key: 'unread-chats',
        title: 'Unread chats',
        icon: 'circle',
        href: href.assistantChats('unread'),
        keywords: ['new messages', 'inbox', 'not read', 'waiting'],
      },
      {
        key: 'archived-chats',
        title: 'Archived chats',
        icon: 'archive',
        href: href.assistantChats('archived'),
        keywords: ['old', 'hidden', 'restore', 'unarchive'],
      },
    ],
  },
  {
    key: 'talk',
    href: '/talk',
    title: 'Walkie-talkie',
    shortTitle: 'Talk',
    icon: 'radio',
    tab: 'talk',
    parent: null,
    keywords: ['walkie talkie', 'push to talk', 'intercom', 'channel', 'radio', 'talk'],
    available: talkAvailable,
    searchable: true,
  },
  {
    key: 'settings',
    href: '/settings',
    title: 'Settings',
    icon: 'settings',
    tab: 'settings',
    parent: null,
    keywords: ['preferences', 'options'],
    available: always,
    badge: (a) => (a.needsAttention ? 'critical' : null),
    searchable: true,
  },
];

const PAGES: readonly RouteDefinition[] = [
  ...HOME,
  ...WEATHER,
  ...DEVICES,
  ...DEVICE_LIST,
  ...CAMERAS,
  ...FITNESS,
  ...NUTRITION,
  ...AUTOMATIONS,
  ...SETTINGS,
  ...CONNECTIONS,
];

function withChildPreloads(tab: RouteDefinition): RouteDefinition {
  const preloads = [
    ...new Set(
      PAGES.filter((page) => page.tab === tab.tab).flatMap((page) =>
        page.preload === undefined ? [] : [page.preload],
      ),
    ),
  ];
  if (preloads.length === 0) {
    return tab;
  }
  return {
    ...tab,
    preload: async (context: PreloadContext): Promise<void> => {
      await Promise.all(preloads.map((preload) => preload(context)));
    },
  };
}

export const ROUTES: readonly RouteDefinition[] = [...TAB_ROUTES.map(withChildPreloads), ...PAGES];

class RouteRegistryError extends Error {
  override readonly name = 'RouteRegistryError';
}

function validate(routes: readonly RouteDefinition[]): void {
  const seen = new Set<string>();
  for (const route of routes) {
    if (seen.has(route.key)) {
      throw new RouteRegistryError(`Two routes use the key ${route.key}.`);
    }
    seen.add(route.key);
  }
  const missing = routes.find((route) => route.parent !== null && !seen.has(route.parent));
  if (missing !== undefined) {
    throw new RouteRegistryError(
      `The route ${missing.key} names an unknown parent ${String(missing.parent)}.`,
    );
  }
}

if (__DEV__) {
  validate(ROUTES);
}
