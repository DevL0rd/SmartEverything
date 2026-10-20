import type { Href } from 'expo-router';
import { parsePluginPageRoute, type NavPinTarget } from '@smarteverything/domain';
import { navTargetHref, pathnameOf } from './nav-targets';
import {
  AUTOMATION,
  CAMERA,
  DEVICE,
  GROUP,
  leafIdOf,
  PLUGIN_PAGE,
  ROOM,
  SCENE,
  STATIC_PAGES,
  type LeafRoute,
} from './pin-routes';
import type { RouteParams } from './stack-handles';

export interface PinLeaf {
  readonly id: string;
  readonly group: string;
  readonly route: string;
  readonly params: RouteParams;
  readonly href: Href;
}

function made(leaf: LeafRoute, params: RouteParams): PinLeaf {
  return {
    id: leafIdOf(leaf, params),
    group: leaf.group,
    route: leaf.route,
    params,
    href: leaf.href(params),
  };
}

function leafOfPage(target: Extract<NavPinTarget, { readonly kind: 'page' }>): PinLeaf | null {
  const plugin = parsePluginPageRoute(target.path);
  if (plugin !== null) {
    return made(PLUGIN_PAGE, { pluginId: plugin.pluginId, page: plugin.pageId });
  }
  const destination = navTargetHref(target);
  const found = destination === null ? undefined : STATIC_PAGES.get(pathnameOf(destination));
  return found === undefined ? null : made(found, {});
}

export function pinLeafOf(target: NavPinTarget): PinLeaf | null {
  switch (target.kind) {
    case 'device':
      return made(DEVICE, { deviceId: target.deviceId });
    case 'camera':
      return made(CAMERA, { cameraId: target.deviceId });
    case 'room':
      return made(ROOM, { roomId: target.roomId });
    case 'group':
      return made(GROUP, { groupId: target.groupId });
    case 'scene':
      return made(SCENE, { sceneId: target.sceneId });
    case 'automation':
      return made(AUTOMATION, { automationId: target.automationId });
    case 'page':
      return leafOfPage(target);
    case 'section':
      return null;
  }
}
