import type { Href } from 'expo-router';
import {
  NAV_PIN_TARGET,
  parsePluginPageRoute,
  pluginPageRoute,
  type NavOpenTarget,
  type NavPinTarget,
} from '@smarteverything/domain';
import { isIconName, type IconName } from '../components/icon';
import { deviceIcon } from '../features/device-visuals';
import { extensionIcon } from '../plugins/declared/extension-icon';
import { settingPageOf } from '../settings/registry';
import { settingsPage } from '../settings/tree';
import type { StoreState } from '../store/state';
import { href } from './hrefs';
import { ROUTES, TAB_ROUTES } from './routes';

export interface TargetFacts {
  readonly exists: boolean;
  readonly title: string | null;
  readonly icon: IconName;
  readonly count: number;
}

type Kind = NavOpenTarget['kind'];

type Of<K extends Kind> = Extract<NavOpenTarget, { readonly kind: K }>;

interface TargetKind<K extends Kind> {
  readonly key: (target: Of<K>) => string;
  readonly href: (target: Of<K>) => Href | null;
  readonly facts: (target: Of<K>, state: StoreState) => TargetFacts;
}

const UNKNOWN_ICON: IconName = 'info';

function named(title: string | undefined, icon: IconName, count = 0): TargetFacts {
  return { exists: title !== undefined, title: title ?? null, icon, count };
}

export function pathnameOf(target: Href): string {
  const path = typeof target === 'string' ? target : target.pathname;
  return path.replace(/^\//u, '').replace(/\/index$/u, '');
}

function routeOf(key: string): (typeof ROUTES)[number] | undefined {
  return ROUTES.find((route) => route.key === key);
}

export interface SettingTarget {
  readonly page: string;
  readonly row: string | null;
}

export function settingTargetOf(target: Of<'setting'>): SettingTarget | null {
  if (settingsPage(target.page) !== undefined) {
    return { page: target.page, row: target.setting };
  }
  const owner = settingPageOf(target.page);
  return owner === undefined ? null : { page: owner, row: target.page };
}

function settingHref(target: Of<'setting'>): Href | null {
  const resolved = settingTargetOf(target);
  if (resolved === null) return null;
  return resolved.row === null
    ? href.settings.page(resolved.page)
    : href.settings.focus(resolved.page, resolved.row);
}

function deviceFacts(deviceId: string, state: StoreState): TargetFacts {
  const device = state.tables.devices.byId[deviceId];
  return named(device?.label, device === undefined ? UNKNOWN_ICON : deviceIcon(device));
}

function sceneFacts(target: Of<'scene'>, state: StoreState): TargetFacts {
  const scene = state.tables.scenes.byId[target.sceneId];
  return named(
    scene?.name,
    scene !== undefined && isIconName(scene.icon) ? scene.icon : 'sparkles',
  );
}

function chatFacts(target: Of<'chat'>, state: StoreState): TargetFacts {
  const chat = state.tables.ai_chats.byId[target.chatId];
  return named(chat?.title, 'messageCircle', chat?.unread_count ?? 0);
}

function pageFacts(target: Of<'page'>, state: StoreState): TargetFacts {
  const extension = parsePluginPageRoute(target.path);
  if (extension !== null) {
    const page = state.tables.plugin_ui.byId[extension.pluginId]?.pages.find(
      (candidate) => candidate.id === extension.pageId,
    );
    return named(page?.title, page === undefined ? UNKNOWN_ICON : extensionIcon(page.icon));
  }
  const route = routeOf(target.path);
  return named(route?.title, route?.icon ?? UNKNOWN_ICON);
}

function pageKey(path: string): string {
  const extension = parsePluginPageRoute(path);
  if (extension !== null) return `page:plugins/${extension.pluginId}/${extension.pageId}`;
  const route = routeOf(path);
  return `page:${route === undefined ? path : pathnameOf(route.href)}`;
}

function pageHref(path: string): Href | null {
  const extension = parsePluginPageRoute(path);
  if (extension !== null) return href.pluginPage(extension.pluginId, extension.pageId);
  return routeOf(path)?.href ?? null;
}

function sectionFacts(target: Of<'section'>): TargetFacts {
  const route = TAB_ROUTES.find((candidate) => candidate.tab === target.section);
  return named(route?.title, route?.icon ?? UNKNOWN_ICON);
}

function settingFacts(target: Of<'setting'>): TargetFacts {
  const resolved = settingTargetOf(target);
  const page = resolved === null ? undefined : settingsPage(resolved.page);
  return named(page?.title, page?.icon ?? UNKNOWN_ICON);
}

const KINDS: { readonly [K in Kind]: TargetKind<K> } = {
  section: {
    key: (target) => `section:${target.section}`,
    href: (target) => TAB_ROUTES.find((route) => route.tab === target.section)?.href ?? null,
    facts: sectionFacts,
  },
  page: {
    key: (target) => pageKey(target.path),
    href: (target) => pageHref(target.path),
    facts: pageFacts,
  },
  setting: {
    key: (target) => `setting:${settingTargetOf(target)?.page ?? target.page}`,
    href: settingHref,
    facts: settingFacts,
  },
  device: {
    key: (target) => `device:${target.deviceId}`,
    href: (target) => ({ pathname: '/device/[deviceId]', params: { deviceId: target.deviceId } }),
    facts: (target, state) => deviceFacts(target.deviceId, state),
  },
  camera: {
    key: (target) => `camera:${target.deviceId}`,
    href: (target) => href.camera(target.deviceId),
    facts: (target, state) => deviceFacts(target.deviceId, state),
  },
  room: {
    key: (target) => `room:${target.roomId}`,
    href: (target) => href.room(target.roomId),
    facts: (target, state) => named(state.tables.rooms.byId[target.roomId]?.name, 'grid'),
  },
  group: {
    key: (target) => `group:${target.groupId}`,
    href: (target) => href.group(target.groupId),
    facts: (target, state) => named(state.tables.device_groups.byId[target.groupId]?.name, 'lamp'),
  },
  scene: {
    key: (target) => `scene:${target.sceneId}`,
    href: (target) => href.scene(target.sceneId),
    facts: sceneFacts,
  },
  automation: {
    key: (target) => `automation:${target.automationId}`,
    href: (target) => href.automation(target.automationId),
    facts: (target, state) =>
      named(state.tables.automations.byId[target.automationId]?.name, 'automations'),
  },
  chat: {
    key: (target) => `chat:${target.chatId}`,
    href: (target) => href.assistantChat(target.chatId),
    facts: chatFacts,
  },
};

function kindOf<K extends Kind>(target: Of<K>): TargetKind<K> {
  return KINDS[target.kind];
}

export function navTargetKey(target: NavOpenTarget): string {
  return kindOf(target).key(target);
}

export function navTargetHref(target: NavOpenTarget): Href | null {
  return kindOf(target).href(target);
}

export function targetFactsOf(target: NavOpenTarget, state: StoreState): TargetFacts {
  return kindOf(target).facts(target, state);
}

interface PathRule {
  readonly pattern: RegExp;
  readonly kind: string;
}

const PATH_RULES: readonly PathRule[] = [
  { pattern: /^device\/([^/]+)/u, kind: 'device' },
  { pattern: /^cameras\/(?!events$|monitor$|settings)([^/]+)/u, kind: 'camera' },
  { pattern: /^rooms\/([^/]+)/u, kind: 'room' },
  { pattern: /^groups\/(?!new$)([^/]+)/u, kind: 'group' },
  { pattern: /^automations\/scenes\/(?!new$)([^/]+)/u, kind: 'scene' },
  {
    pattern:
      /^automations\/(?!runs$|scenes|scheduled|schedule$|nodes|templates|secrets$|variables|new$)([^/]+)/u,
    kind: 'automation',
  },
  { pattern: /^assistant\/chat\/([^/]+)/u, kind: 'chat' },
  { pattern: /^settings\/(.+)/u, kind: 'setting' },
];

export function leafKeyOfPath(pathname: string): string {
  const path = pathname.replace(/^\//u, '').replace(/\/index$/u, '');
  for (const rule of PATH_RULES) {
    const found = rule.pattern.exec(path)?.[1];
    if (found !== undefined) return `${rule.kind}:${found}`;
  }
  return `page:${path}`;
}

const PLUGIN_PAGE_PATH = /^plugins\/([^/]+)\/([^/]+)$/u;

function pageTargetOf(path: string): unknown {
  const plugin = PLUGIN_PAGE_PATH.exec(path);
  if (plugin?.[1] !== undefined && plugin[2] !== undefined) {
    return { kind: 'page', path: pluginPageRoute(plugin[1], plugin[2]) };
  }
  const route = ROUTES.find((candidate) => pathnameOf(candidate.href) === path);
  return route === undefined ? null : { kind: 'page', path: route.key };
}

function candidateOf(kind: string, id: string): unknown {
  switch (kind) {
    case 'device':
      return { kind, deviceId: id, focus: null };
    case 'camera':
      return { kind, deviceId: id };
    case 'room':
      return { kind, roomId: id };
    case 'group':
      return { kind, groupId: id };
    case 'scene':
      return { kind, sceneId: id };
    case 'automation':
      return { kind, automationId: id, focus: null };
    case 'page':
      return pageTargetOf(id);
    default:
      return null;
  }
}

function isSectionOrSettingsPage(path: string): boolean {
  return TAB_ROUTES.some((route) => route.key === path) || routeOf(path)?.tab === 'settings';
}

export function pinnableTarget(target: NavPinTarget): NavPinTarget | null {
  if (navTargetHref(target) === null) return null;
  return target.kind === 'page' && isSectionOrSettingsPage(target.path) ? null : target;
}

export function pinExists(target: NavPinTarget, facts: ReadonlyMap<string, TargetFacts>): boolean {
  return pinnableTarget(target) !== null && facts.get(navTargetKey(target))?.exists === true;
}

export function pinTargetOfPath(pathname: string): NavPinTarget | null {
  const key = leafKeyOfPath(pathname);
  const split = key.indexOf(':');
  const parsed = NAV_PIN_TARGET.safeParse(candidateOf(key.slice(0, split), key.slice(split + 1)));
  return parsed.success ? pinnableTarget(parsed.data) : null;
}
