import type { Href } from 'expo-router';
import { CLIENT_PREFS } from '@smarteverything/domain';
import { href } from '../app-shell/hrefs';
import { ACCENT_LABELS } from '../design/tokens';
import { joinParts, plural } from '../format/text';
import { zoneLabel } from '../format/time';
import { talkLinked } from '../../modules/health-connect';
import type { StoreState } from '../store/state';
import { ASSISTANT_PAGES } from './tree-assistant';
import { PLUGIN_PAGES } from './tree-plugins';
import { mountOf } from './mounts';
import type { SettingEnv, SettingsPageDefinition } from './types';

const THEME_LABELS = { system: 'System theme', light: 'Light', dark: 'Dark' } as const;

function appearanceSummary(state: StoreState): string | null {
  const read = CLIENT_PREFS.appearance.decode(
    state.tables.layouts.byId[CLIENT_PREFS.appearance.storageKey]?.layout ?? null,
  );
  return read.status === 'invalid'
    ? null
    : `${THEME_LABELS[read.value.theme]} · ${ACCENT_LABELS[read.value.accent]}`;
}

const healthVisible = (env: SettingEnv): boolean =>
  env.availability.hasHealth || env.platform === 'android';

function homeSummary(state: StoreState): string | null {
  const zone = state.settings?.time_zone;
  return zone === undefined
    ? null
    : joinParts([zoneLabel(zone), countOf(state.tables.rooms.ids.length, 'room')]);
}

const countOf = (count: number, one: string): string | null =>
  count === 0 ? null : plural(count, one);

const ownerOnly = (env: { readonly owner: boolean }): boolean => env.owner;

const talkReady = talkLinked();

export const SETTINGS_TREE: readonly SettingsPageDefinition[] = [
  {
    id: 'home',
    title: 'Home',
    icon: 'home',
    parent: null,
    group: 'Home',
    keywords: ['name', 'house'],
    summary: homeSummary,
  },
  {
    id: 'home/location',
    title: 'Location & time zone',
    icon: 'mapPin',
    parent: 'home',
    group: null,
    summary: (state) => (state.settings === null ? null : zoneLabel(state.settings.time_zone)),
    keywords: ['latitude', 'longitude', 'time zone', 'sunrise', 'sunset'],
  },
  {
    id: 'home/rooms',
    title: 'Rooms',
    icon: 'grid',
    parent: 'home',
    group: null,
    summary: (state) => countOf(state.tables.rooms.ids.length, 'room'),
    keywords: ['room', 'areas'],
  },
  {
    id: 'members',
    title: 'Paired devices',
    icon: 'smartphone',
    parent: null,
    group: 'Home',
    summary: (state) => countOf(state.tables.clients.ids.length, 'paired device'),
    keywords: ['paired', 'phones', 'members', 'clients', 'pair'],
    visible: ownerOnly,
  },
  {
    id: 'profiles',
    title: 'Profiles',
    icon: 'user',
    parent: null,
    group: 'Home',
    summary: (state) => plural(state.tables.profiles.ids.length, 'person', 'people'),
    keywords: ['people', 'person', 'profile', 'wife', 'partner', 'scale', 'weight'],
  },
  {
    id: 'devices',
    title: 'Device settings',
    icon: 'bulb',
    parent: null,
    group: null,
    summary: (state) => countOf(state.tables.devices.ids.length, 'device'),
    keywords: ['hidden', 'add device', 'rename'],
  },
  {
    id: 'devices/add',
    title: 'Add a device',
    icon: 'plus',
    parent: 'devices',
    group: null,
    keywords: ['tv', 'link account'],
  },
  {
    id: 'connections',
    title: 'Accounts',
    icon: 'link',
    parent: null,
    group: 'Connections',
    keywords: ['xiaomi', 'tuya', 'smart life', 'smartthings', 'providers', 'integrations'],
    visible: ownerOnly,
  },
  {
    id: 'connections/add',
    title: 'Add account',
    icon: 'plus',
    parent: 'connections',
    group: null,
    keywords: ['provider'],
    visible: ownerOnly,
  },
  ...PLUGIN_PAGES,
  ...ASSISTANT_PAGES,
  {
    id: 'cameras',
    title: 'Camera settings',
    icon: 'cameras',
    parent: null,
    group: null,
    keywords: ['recording', 'night vision', 'privacy'],
    visible: (env) => env.availability.hasCameras,
  },
  {
    id: 'cameras/remote-viewing',
    title: 'Remote viewing',
    icon: 'globe',
    parent: 'cameras',
    group: null,
    keywords: ['away', 'ice', 'webrtc'],
    visible: (env) => env.availability.hasCameras,
  },
  {
    id: 'talk',
    title: 'Walkie-talkie settings',
    icon: 'radio',
    parent: null,
    group: null,
    keywords: ['walkie talkie', 'push to talk', 'intercom', 'channels', 'shortcut', 'headset'],
    visible: (env) => env.platform !== 'android' || talkReady,
  },
  {
    id: 'talk/channels',
    title: 'Manage channels',
    icon: 'list',
    parent: 'talk',
    group: null,
    summary: (state) => countOf(state.tables.talk_channels.ids.length, 'channel'),
    keywords: ['new channel', 'members', 'cameras', 'priority'],
    visible: ownerOnly,
  },
  {
    id: 'health',
    title: 'Fitness settings',
    icon: 'fitness',
    parent: null,
    group: null,
    keywords: ['health connect', 'goals', 'heart rate', 'sync'],
    visible: healthVisible,
  },
  {
    id: 'health/goals',
    title: 'Daily goals',
    icon: 'trophy',
    parent: 'health',
    group: null,
    visible: healthVisible,
    keywords: ['steps', 'move', 'sleep goal'],
  },
  {
    id: 'health/nutrition',
    title: 'Nutrition',
    icon: 'salad',
    parent: 'health',
    group: null,
    visible: healthVisible,
    keywords: ['food', 'calories', 'macros', 'water', 'glass'],
  },
  {
    id: 'health/watch-settings',
    title: 'Watch settings',
    icon: 'watch',
    parent: 'health',
    group: null,
    visible: (env) => env.availability.hasWatch,
    keywords: [
      'watch',
      'alarms',
      'heart rate',
      'spo2',
      'stress',
      'stand',
      'sleep mode',
      'watch face',
    ],
  },
  {
    id: 'health/watch',
    title: 'Watch on this phone',
    icon: 'watch',
    parent: 'health',
    group: null,
    platform: 'android',
    keywords: ['watch', 'notifications', 'calls', 'music', 'find my phone', 'wearable'],
  },
  {
    id: 'health/watch/apps',
    title: 'Notification apps',
    icon: 'bell',
    parent: 'health/watch',
    group: null,
    platform: 'android',
    keywords: ['notifications', 'apps', 'watch'],
  },
  {
    id: 'health/sources',
    title: 'Data sources',
    icon: 'smartphone',
    parent: 'health',
    group: null,
    visible: healthVisible,
    keywords: ['apps', 'sources'],
  },
  {
    id: 'this-phone',
    title: 'This phone',
    icon: 'smartphone',
    parent: null,
    group: 'App',
    platform: 'android',
    keywords: ['phone', 'context', 'driving', 'walking', 'car', 'screen time', 'background'],
  },
  {
    id: 'appearance',
    title: 'Appearance',
    icon: 'palette',
    parent: null,
    group: 'App',
    summary: appearanceSummary,
    keywords: ['theme', 'dark', 'light', 'accent', 'colour', 'density', 'motion'],
  },
  {
    id: 'notifications',
    title: 'Notifications',
    icon: 'bell',
    parent: null,
    group: 'App',
    keywords: ['push', 'doorbell', 'ring', 'calls'],
  },
  {
    id: 'notifications/push-service',
    title: 'Push service',
    icon: 'server',
    parent: 'notifications',
    group: null,
    summary: (state) => (state.settings?.push_project_id === null ? 'Off' : 'On'),
    keywords: ['alerts when closed'],
    visible: ownerOnly,
  },
  {
    id: 'notifications/push-service/firebase',
    title: 'Your own Firebase project',
    icon: 'key',
    parent: 'notifications/push-service',
    group: null,
    keywords: ['firebase', 'service account', 'fcm'],
    visible: ownerOnly,
  },
  {
    id: 'server',
    title: 'Server & remote access',
    icon: 'server',
    parent: null,
    group: 'System',
    keywords: ['public url', 'remote', 'switch server', 'unpair', 'service'],
  },
  {
    id: 'server/firewall',
    title: 'Firewall',
    icon: 'shield',
    parent: 'server',
    group: null,
    keywords: ['ports', 'blocked', 'rules'],
  },
  {
    id: 'server/diagnostics',
    title: 'Diagnostics',
    icon: 'activity',
    parent: 'server',
    group: null,
    keywords: ['logs', 'version', 'ffmpeg', 'uptime'],
  },
  {
    id: 'about',
    title: 'About',
    icon: 'info',
    parent: null,
    group: 'System',
    keywords: ['version', 'licences'],
  },
  {
    id: 'about/licences',
    title: 'Open-source licences',
    icon: 'book',
    parent: 'about',
    group: null,
    keywords: ['licences', 'licenses', 'open source', 'credits', 'go2rtc'],
  },
  {
    id: 'about/privacy',
    title: 'Privacy policy',
    icon: 'fileText',
    parent: 'about',
    group: null,
    keywords: ['privacy'],
  },
];

export const SETTINGS_GROUPS = ['Home', 'Connections', 'App', 'System'] as const;

export function settingsPage(id: string): SettingsPageDefinition | undefined {
  return SETTINGS_TREE.find((page) => page.id === id);
}

export function breadcrumbOf(id: string): readonly SettingsPageDefinition[] {
  const page = settingsPage(id);
  if (page === undefined) {
    return [];
  }
  return page.parent === null ? [page] : [...breadcrumbOf(page.parent), page];
}

export interface SettingsCrumb {
  readonly label: string;
  readonly href: Href;
}

export function settingsTrail(id: string): readonly SettingsCrumb[] {
  const mount = mountOf(id);
  const start: SettingsCrumb =
    mount === null
      ? { label: 'Settings', href: href.settings.index() }
      : { label: mount.owner, href: mount.ownerHref };
  const pages = breadcrumbOf(id).map((page) => ({
    label: mount !== null && page.parent === null ? 'Settings' : page.title,
    href: pageHref(page),
  }));
  return [start, ...pages];
}

export function onPlatform(page: SettingsPageDefinition, env: SettingEnv): boolean {
  return page.platform === undefined || page.platform === env.platform;
}

export function pageHref(page: SettingsPageDefinition): Href {
  return page.href ?? href.settings.page(page.id);
}

export function childrenOf(id: string): readonly SettingsPageDefinition[] {
  return SETTINGS_TREE.filter((page) => page.parent === id);
}

class SettingsTreeError extends Error {
  override readonly name = 'SettingsTreeError';
}

function validateTree(pages: readonly SettingsPageDefinition[]): void {
  const ids = new Set<string>();
  for (const page of pages) {
    if (ids.has(page.id)) {
      throw new SettingsTreeError(`Two settings pages use the id ${page.id}.`);
    }
    ids.add(page.id);
  }
  const orphan = pages.find((page) => page.parent !== null && !ids.has(page.parent));
  if (orphan !== undefined) {
    throw new SettingsTreeError(
      `The settings page ${orphan.id} names the unknown parent ${String(orphan.parent)}.`,
    );
  }
}

if (__DEV__) {
  validateTree(SETTINGS_TREE);
}
