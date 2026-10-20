import type { Href } from 'expo-router';
import type { RouteParams } from './stack-handles';

export interface LeafRoute {
  readonly group: string;
  readonly route: string;
  readonly keys: readonly string[];
  readonly nested: boolean;
  readonly href: (params: RouteParams) => Href;
}

function segment(params: RouteParams, key: string): string {
  return encodeURIComponent(params[key] ?? '');
}

export const DEVICE: LeafRoute = {
  group: '(home)',
  route: 'device/[deviceId]/index',
  keys: ['deviceId'],
  nested: false,
  href: (params) => `/(app)/(home)/device/${segment(params, 'deviceId')}`,
};
export const CAMERA: LeafRoute = {
  group: '(cameras)',
  route: 'cameras/[cameraId]/index',
  keys: ['cameraId'],
  nested: false,
  href: (params) => `/(app)/(cameras)/cameras/${segment(params, 'cameraId')}`,
};
export const ROOM: LeafRoute = {
  group: '(home)',
  route: 'rooms/[roomId]/index',
  keys: ['roomId'],
  nested: false,
  href: (params) => `/(app)/(home)/rooms/${segment(params, 'roomId')}`,
};
export const GROUP: LeafRoute = {
  group: '(home)',
  route: 'groups/[groupId]',
  keys: ['groupId'],
  nested: false,
  href: (params) => `/(app)/(home)/groups/${segment(params, 'groupId')}`,
};
export const PLUGIN_PAGE: LeafRoute = {
  group: '(home)',
  route: 'plugins/[pluginId]/[page]',
  keys: ['pluginId', 'page'],
  nested: false,
  href: (params) =>
    `/(app)/(home)/plugins/${segment(params, 'pluginId')}/${segment(params, 'page')}`,
};
export const SCENE: LeafRoute = {
  group: '(automations)',
  route: 'scenes/[sceneId]',
  keys: ['sceneId'],
  nested: true,
  href: (params) => `/(app)/(automations)/automations/scenes/${segment(params, 'sceneId')}`,
};
export const AUTOMATION: LeafRoute = {
  group: '(automations)',
  route: '[automationId]/index',
  keys: ['automationId'],
  nested: true,
  href: (params) => `/(app)/(automations)/automations/${segment(params, 'automationId')}`,
};

function staticPage(group: string, route: string, href: Href): LeafRoute {
  return { group, route, keys: [], nested: false, href: () => href };
}

export const STATIC_PAGES: ReadonlyMap<string, LeafRoute> = new Map([
  ['weather', staticPage('(home)', 'weather', '/(app)/(home)/weather')],
  ['activity', staticPage('(home)', 'activity', '/(app)/(home)/activity')],
  ['devices/air', staticPage('(devices)', 'devices/air', '/(app)/(devices)/devices/air')],
  [
    'devices/supplies',
    staticPage('(devices)', 'devices/supplies', '/(app)/(devices)/devices/supplies'),
  ],
  ['cameras/events', staticPage('(cameras)', 'cameras/events', '/(app)/(cameras)/cameras/events')],
  [
    'cameras/monitor',
    staticPage('(cameras)', 'cameras/monitor', '/(app)/(cameras)/cameras/monitor'),
  ],
]);

export const LEAF_ROUTES: readonly LeafRoute[] = [
  DEVICE,
  CAMERA,
  ROOM,
  GROUP,
  PLUGIN_PAGE,
  SCENE,
  AUTOMATION,
  ...STATIC_PAGES.values(),
];

export function leafRoutesOf(group: string): readonly LeafRoute[] {
  return LEAF_ROUTES.filter((leaf) => leaf.group === group);
}

export function leafIdOf(leaf: LeafRoute, params: RouteParams): string {
  return [leaf.group, leaf.route, ...leaf.keys.map((key) => params[key] ?? '')].join('|');
}

export function singularIdOf(
  leaf: LeafRoute,
): (name: string, params: Readonly<Record<string, unknown>>) => string | undefined {
  return (_name, params) => {
    const values = leaf.keys.map((key) => params[key]);
    return values.every((value) => typeof value === 'string') ? values.join('/') : undefined;
  };
}
