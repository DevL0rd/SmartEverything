import { cameraTranscriptPages } from './camera-transcript-pages';
import { APP_PLUGINS } from '../plugins/registry';
import type { Href } from 'expo-router';
import {
  displayName,
  triggerSearchKeywords,
  AUTOMATION_DEFINITION,
  CAMERA_EVENT_SEARCH_WORDS,
  isCamera,
  isScheduleActive,
  roomNameOf,
  type PluginRow,
  type AiAgentRun,
  type ProviderMetadata,
  type PluginSetting,
  type SearchDevice,
  type SearchSetting,
  type SearchSources,
} from '@smarteverything/domain';
import { extensionPages, type ExtensionSearchData } from './extension-pages';
import { chatProviderPages } from './chat-provider-pages';
import { href } from '../app-shell/hrefs';
import { ROUTES, type RouteDefinition } from '../app-shell/routes';
import type { IconName } from '../components/icon';
import { visibleSettings } from '../settings/registry';
import { SETTINGS_TREE, settingsPage, settingsTrail } from '../settings/tree';
import type { SettingDefinition, SettingEnv, SettingsPageDefinition } from '../settings/types';
import { rowsOf, type Device, type StoreState } from '../store/state';

export interface SearchTables extends ExtensionSearchData {
  readonly devices: StoreState['tables']['devices'];
  readonly rooms: StoreState['tables']['rooms'];
  readonly scenes: StoreState['tables']['scenes'];
  readonly automations: StoreState['tables']['automations'];
  readonly scheduled: StoreState['tables']['scheduled_actions'];
  readonly plugins: StoreState['tables']['plugins'];
  readonly pluginStreams: StoreState['tables']['plugin_streams'];
  readonly chats: readonly SearchChat[];
}

export interface SearchChat {
  readonly id: string;
  readonly title: string;
  readonly source: string;
  readonly pinned: boolean;
  readonly computer: boolean;
  readonly runtime?: 'claude' | 'codex' | 'dsh';
  readonly metadata?: ProviderMetadata | null;
  readonly agents?: readonly AiAgentRun[];
}

export interface SourceLinks {
  readonly links: Map<string, Href>;
  readonly icons: Map<string, IconName>;
  readonly parents: Map<string, string>;
  readonly plugins: Set<string>;
}

const SCHEDULED_ROUTE = 'automations.scheduled';

function pageKey(path: string): string {
  return `page:${path}`;
}

function settingsPageKey(pageId: string): string {
  return `setting:page/${pageId}`;
}

export interface NamedDevice {
  readonly device: Device;
  readonly name: string;
  readonly room: string | null;
}

function trailOf(pageId: string, inclusive: boolean): string {
  const crumbs = settingsTrail(pageId).map((crumb) => crumb.label);
  return (inclusive ? crumbs : crumbs.slice(0, -1)).join(' › ');
}

function treePage(page: SettingsPageDefinition, out: SourceLinks): SearchSetting {
  const id = `page/${page.id}`;
  out.links.set(`setting:${id}`, href.settings.page(page.id));
  out.icons.set(`setting:${id}`, page.icon);
  const parent = page.parent === null ? pageKey('settings') : settingsPageKey(page.parent);
  out.parents.set(`setting:${id}`, parent);
  return {
    id,
    title: page.title,
    section: trailOf(page.id, false),
    keywords: page.keywords,
    state: null,
    value: undefined,
    runLabel: 'Open',
    path: '',
  };
}

function registrySetting(setting: SettingDefinition, out: SourceLinks): SearchSetting {
  const page = settingsPage(setting.page);
  out.links.set(
    `setting:${setting.id}`,
    setting.control === 'link' ? setting.href : href.settings.focus(setting.page, setting.id),
  );
  out.icons.set(`setting:${setting.id}`, setting.icon ?? page?.icon ?? 'settings');
  out.parents.set(`setting:${setting.id}`, settingsPageKey(setting.page));
  return {
    id: setting.id,
    title: setting.title,
    section: page === undefined ? 'Settings' : trailOf(page.id, true),
    keywords: [...setting.keywords, ...(page === undefined ? [] : [page.title])],
    state: null,
    value: undefined,
    runLabel: 'Open',
    path: '',
  };
}

function settingsOf(env: SettingEnv, out: SourceLinks): SearchSources['settings'] {
  const pages = SETTINGS_TREE.filter(
    (page) => page.href === undefined && (page.visible?.(env) ?? true),
  );
  return [
    ...pages.map((page) => treePage(page, out)),
    ...visibleSettings(env).map((setting) => registrySetting(setting, out)),
  ];
}

function scheduledPages(tables: SearchTables, out: SourceLinks): SearchSources['pages'] {
  return rowsOf(tables.scheduled)
    .filter((row) => isScheduleActive(row.state))
    .map((row) => {
      const key = `scheduled:${row.id}`;
      out.links.set(`page:${key}`, href.scheduledItem(row.id));
      out.icons.set(`page:${key}`, 'timer');
      out.parents.set(pageKey(key), pageKey(SCHEDULED_ROUTE));
      const title = row.label ?? row.step_lines.find((line) => line !== null) ?? 'Scheduled action';
      return {
        path: key,
        title,
        description: 'Scheduled',
        keywords: ['scheduled', 'timer', 'later', 'cancel'],
      };
    });
}

const ASSISTANT_ROUTE = 'assistant';

function chatPages(tables: SearchTables, out: SourceLinks): SearchSources['pages'] {
  return tables.chats.map((chat) => {
    const key = `chat:${chat.id}`;
    out.links.set(pageKey(key), href.assistantChat(chat.id));
    out.icons.set(pageKey(key), 'sparkles');
    out.parents.set(pageKey(key), pageKey(ASSISTANT_ROUTE));
    return {
      path: key,
      title: chat.title,
      description: 'Chat',
      keywords: ['chat', 'conversation', chat.source, ...(chat.pinned ? ['pinned'] : [])],
    };
  });
}

interface PluginPage {
  readonly path: string;
  readonly title: string;
  readonly description: string;
  readonly keywords: readonly string[];
  readonly to: Href;
}

function settingPage(
  row: PluginRow,
  parent: string,
  entry: readonly [string, PluginSetting],
): PluginPage {
  const [name, setting] = entry;
  const description = setting.description ?? '';
  return setting.type === 'list'
    ? {
        path: `${parent}#list:${name}`,
        title: setting.title,
        description: row.manifest.name,
        keywords: ['list', 'plugin', row.manifest.name, description],
        to: href.pluginList(row.id, name),
      }
    : {
        path: `${parent}#setting:${name}`,
        title: setting.title,
        description: row.manifest.name,
        keywords: ['setting', 'plugin', row.manifest.name, setting.group ?? '', description],
        to: href.pluginSettings(row.id),
      };
}

function pluginSubPages(row: PluginRow, parent: string, out: SourceLinks): SearchSources['pages'] {
  const settings = Object.entries(row.manifest.contributes.settings).map((entry) =>
    settingPage(row, parent, entry),
  );
  const people = row.manifest.permissions.inbound
    ? [
        {
          path: `${parent}#people`,
          title: 'People',
          description: row.manifest.name,
          keywords: ['people', 'approved', 'owner', 'who can', 'plugin', row.manifest.name],
          to: href.pluginSettings(row.id, 'people'),
        },
      ]
    : [];
  return [...people, ...settings, ...nativePluginSettings(row, parent)].map(({ to, ...page }) => {
    out.links.set(pageKey(page.path), to);
    out.icons.set(pageKey(page.path), 'puzzle');
    out.parents.set(pageKey(page.path), pageKey(parent));
    return page;
  });
}

function pluginPages(
  tables: SearchTables,
  env: SettingEnv,
  out: SourceLinks,
): SearchSources['pages'] {
  if (!env.owner) {
    return [];
  }
  return rowsOf(tables.plugins).flatMap((row) => {
    const key = `plugin:${row.id}`;
    out.links.set(`page:${key}`, href.pluginSettings(row.id));
    out.icons.set(`page:${key}`, 'puzzle');
    out.plugins.add(pageKey(key));
    return [
      {
        path: key,
        title: row.manifest.name,
        description: 'Plugin',
        keywords: ['plugin', row.manifest.publisher, row.manifest.description],
      },
      ...pluginSubPages(row, key, out),
    ];
  });
}

function ancestorTitles(route: RouteDefinition): readonly string[] {
  const parent = ROUTES.find((candidate) => candidate.key === route.parent);
  return parent === undefined ? [] : [parent.title, ...ancestorTitles(parent)];
}

function routeActions(
  route: RouteDefinition,
  env: SettingEnv,
  out: SourceLinks,
): SearchSources['pages'] {
  return (route.actions ?? [])
    .filter((action) => action.ownerOnly !== true || env.owner)
    .map((action) => {
      const path = `${route.key}#${action.key}`;
      out.links.set(pageKey(path), action.href);
      out.icons.set(pageKey(path), action.icon);
      out.parents.set(pageKey(path), pageKey(route.key));
      return { path, title: action.title, description: '', keywords: action.keywords };
    });
}

function routePage(route: RouteDefinition, out: SourceLinks): SearchSources['pages'][number] {
  const key = pageKey(route.key);
  out.links.set(key, route.href);
  out.icons.set(key, route.icon);
  if (route.parent !== null) {
    out.parents.set(key, pageKey(route.parent));
  }
  return {
    path: route.key,
    title: route.title,
    description: '',
    keywords: [...route.keywords, ...ancestorTitles(route)],
  };
}

function pagesOf(env: SettingEnv, out: SourceLinks): SearchSources['pages'] {
  return ROUTES.filter((route) => route.searchable && route.available(env.availability)).flatMap(
    (route) => [routePage(route, out), ...routeActions(route, env, out)],
  );
}

export function namedDevices(tables: SearchTables): readonly NamedDevice[] {
  const rooms = rowsOf(tables.rooms);
  const all = rowsOf(tables.devices);
  return all
    .filter((device) => !device.hidden)
    .map((device) => ({
      device,
      name: displayName(device, all, rooms),
      room: roomNameOf(device, rooms),
    }));
}

function deviceOf(named: NamedDevice): SearchDevice {
  return {
    id: named.device.id,
    name: named.name,
    room: named.room,
    kind: named.device.kind,
    model: named.device.model,
    online: named.device.online,
    favourite: named.device.favourite,
    capabilities: isCamera(named.device) ? [] : named.device.capabilities,
    state: {},
  };
}

function routinesOf(tables: SearchTables): Pick<SearchSources, 'scenes' | 'automations'> {
  return {
    scenes: rowsOf(tables.scenes).map((scene) => ({ id: scene.id, name: scene.name, path: '' })),
    automations: rowsOf(tables.automations).map((automation) => ({
      id: automation.id,
      name: automation.name,
      enabled: automation.enabled,
      triggerKeywords: triggerSearchKeywords(
        AUTOMATION_DEFINITION.parse(automation.definition).triggers,
      ),
      path: '',
    })),
  };
}

function cameraTimelinePages(
  devices: readonly NamedDevice[],
  out: SourceLinks,
): SearchSources['pages'] {
  return devices
    .filter((named) => isCamera(named.device))
    .map((named) => {
      const path = `camera-timeline:${named.device.id}`;
      out.links.set(pageKey(path), href.camera(named.device.id));
      out.icons.set(pageKey(path), 'film');
      out.parents.set(pageKey(path), `device:${named.device.id}`);
      return {
        path,
        title: `Timeline — ${named.name}`,
        description: 'Camera events',
        keywords: [
          'camera',
          'event',
          'events',
          'history',
          'timeline',
          named.name,
          ...CAMERA_EVENT_SEARCH_WORDS,
        ],
      };
    });
}

export function sourcesOf(
  tables: SearchTables,
  devices: readonly NamedDevice[],
  env: SettingEnv,
  out: SourceLinks,
): SearchSources {
  return {
    devices: devices.map(deviceOf),
    rooms: rowsOf(tables.rooms).map((room) => ({
      id: room.id,
      name: room.name,
      deviceCount: devices.filter((named) => named.device.room_id === room.id).length,
    })),
    pages: [
      ...pagesOf(env, out),
      ...cameraTimelinePages(devices, out),
      ...cameraTranscriptPages(devices, out),
      ...extensionPages(tables, env.owner, out),
      ...scheduledPages(tables, out),
      ...pluginPages(tables, env, out),
      ...chatPages(tables, out),
      ...tables.chats.flatMap((chat) => chatProviderPages(chat, out, env.owner)),
    ],
    settings: settingsOf(env, out),
    ...routinesOf(tables),
    irRemotes: [],
    cameras: [],
  };
}

function nativePluginSettings(row: PluginRow, parent: string): readonly PluginPage[] {
  const plugin = APP_PLUGINS.find((entry) => entry.id === row.id);
  return (plugin?.settingsSearch ?? []).map((item) => ({
    path: `${parent}#native:${item.id}`,
    title: item.title,
    description: row.manifest.name,
    keywords: item.keywords,
    to: {
      pathname: '/settings/[...page]',
      params: { page: ['plugins', row.id], focus: item.focus },
    },
  }));
}
