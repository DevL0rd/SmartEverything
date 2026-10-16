import type { Href } from 'expo-router';
import {
  buildSearchIndex,
  isCamera,
  type SearchEntry,
  type SearchIndex,
} from '@smarteverything/domain';
import { href } from '../app-shell/hrefs';
import type { IconName } from '../components/icon';
import {
  chatSourceOf,
  useExtensions,
  useExtensionConfiguration,
  useHarnessCatalogue,
} from '../features/assistant';
import { deviceIcon } from '../features/device-visuals';
import { useSettingEnv } from '../settings/env';
import type { SettingEnv } from '../settings/types';
import { memoOnInputs } from '../store/memo-selector';
import { shallowEqual, useStoreSelector } from '../store/store-context';
import type { StoreState } from '../store/state';
import {
  namedDevices,
  sourcesOf,
  type NamedDevice,
  type SearchChat,
  type SearchTables,
  type SourceLinks,
} from './sources';
import { deviceSources, type DeviceControl } from './device-entries';
import { useCachedProviderChats } from './cached-provider-chats';
import { synonymsOf } from './synonyms';

export interface SearchCatalogue {
  readonly index: SearchIndex;
  readonly entries: ReadonlyMap<string, SearchEntry>;
  readonly links: ReadonlyMap<string, Href>;
  readonly icons: ReadonlyMap<string, IconName>;
  readonly devices: ReadonlyMap<string, NamedDevice>;
  readonly parents: ReadonlyMap<string, string>;
  readonly children: ReadonlyMap<string, readonly string[]>;
  readonly plugins: ReadonlySet<string>;
  readonly controls: ReadonlyMap<string, DeviceControl>;
}

const GROUP_ICONS: Readonly<Record<SearchEntry['group'], IconName>> = {
  action: 'play',
  device: 'cpu',
  room: 'grid',
  setting: 'settings',
  scene: 'sparkles',
  page: 'activity',
  automation: 'automations',
};

export function deviceIdOf(entry: SearchEntry): string | null {
  const target = entry.open;
  return 'deviceId' in target ? target.deviceId : null;
}

function routineLink(entry: SearchEntry): Href {
  if (entry.open.kind === 'room') {
    return href.room(entry.open.roomId);
  }
  const target = entry.run;
  if (target?.kind === 'scene') {
    return href.scene(target.sceneId);
  }
  return target?.kind === 'automation' ? href.automation(target.automationId) : href.home();
}

function linkOf(entry: SearchEntry, devices: ReadonlyMap<string, NamedDevice>): Href {
  const deviceId = deviceIdOf(entry);
  const named = deviceId === null ? undefined : devices.get(deviceId);
  if (named === undefined) {
    return routineLink(entry);
  }
  return href.device(named.device);
}

function iconOf(entry: SearchEntry, devices: ReadonlyMap<string, NamedDevice>): IconName {
  const deviceId = deviceIdOf(entry);
  const named = deviceId === null ? undefined : devices.get(deviceId);
  return entry.group === 'device' && named !== undefined
    ? deviceIcon(named.device)
    : GROUP_ICONS[entry.group];
}

function adjusted(entry: SearchEntry, devices: ReadonlyMap<string, NamedDevice>): SearchEntry {
  const deviceId = deviceIdOf(entry);
  const named = deviceId === null ? undefined : devices.get(deviceId);
  if (named === undefined) {
    return entry;
  }
  if (entry.group !== 'device' || !isCamera(named.device)) {
    return entry;
  }
  return {
    ...entry,
    run: null,
    runLabel: null,
    open: { kind: 'camera', deviceId: named.device.id, talk: false },
  };
}

function describe(
  entry: SearchEntry,
  devices: ReadonlyMap<string, NamedDevice>,
  out: SourceLinks,
): void {
  if (entry.run?.kind !== 'command' || entry.group !== 'action') {
    out.links.set(entry.id, out.links.get(entry.id) ?? linkOf(entry, devices));
  }
  out.icons.set(entry.id, out.icons.get(entry.id) ?? iconOf(entry, devices));
  const deviceId = deviceIdOf(entry);
  if (deviceId !== null && entry.group !== 'device' && !out.parents.has(entry.id)) {
    out.parents.set(entry.id, `device:${deviceId}`);
  }
}

function isIndexed(entry: SearchEntry): boolean {
  return !(entry.group === 'page' && entry.open.kind === 'device-page');
}

function widened(entry: SearchEntry): SearchEntry {
  const synonyms = synonymsOf(entry.title);
  return synonyms.length === 0 ? entry : { ...entry, keywords: [...entry.keywords, ...synonyms] };
}

function childrenOf(parents: ReadonlyMap<string, string>): Map<string, string[]> {
  const children = new Map<string, string[]>();
  for (const [child, parent] of parents) {
    children.set(parent, [...(children.get(parent) ?? []), child]);
  }
  return children;
}

function build(tables: SearchTables, env: SettingEnv): SearchCatalogue {
  const named = namedDevices(tables);
  const devices = new Map(named.map((entry) => [entry.device.id, entry]));
  const out: SourceLinks = {
    links: new Map(),
    icons: new Map(),
    parents: new Map(),
    plugins: new Set(),
  };
  const built = buildSearchIndex(sourcesOf(tables, named, env, out));
  const extra = deviceSources(named, out, tables.pluginStreams);
  const entries = [...built.entries.filter(isIndexed), ...extra.entries].map((entry) =>
    widened(adjusted(entry, devices)),
  );
  for (const entry of entries) {
    describe(entry, devices, out);
  }
  return {
    index: { entries, numbers: built.numbers },
    entries: new Map(entries.map((entry) => [entry.id, entry])),
    ...out,
    children: childrenOf(out.parents),
    controls: extra.controls,
    devices,
  };
}

interface Cached {
  readonly tables: readonly unknown[];
  readonly env: SettingEnv;
  readonly catalogue: SearchCatalogue;
}

let cached: Cached | null = null;

function sameEnv(left: SettingEnv, right: SettingEnv): boolean {
  return (
    left.owner === right.owner &&
    left.platform === right.platform &&
    left.availability === right.availability
  );
}

function catalogueFor(tables: SearchTables, env: SettingEnv): SearchCatalogue {
  const key = [
    tables.devices,
    tables.rooms,
    tables.deviceGroups,
    tables.scenes,
    tables.automations,
    tables.automationRuns,
    tables.automationValues,
    tables.automationSequences,
    tables.scheduled,
    tables.plugins,
    tables.pluginStreams,
    tables.chats,
    tables.extensions,
    tables.configuration,
    tables.inventory,
  ];
  if (cached !== null && shallowEqual(cached.tables, key) && sameEnv(cached.env, env)) {
    return cached.catalogue;
  }
  const catalogue = build(tables, env);
  cached = { tables: key, env, catalogue };
  return catalogue;
}

const searchChatsOf = memoOnInputs(
  (state: StoreState) => [state.tables.ai_chats, state.tables.plugins],
  (state): readonly SearchChat[] => {
    const names = new Map(state.tables.plugins.rows.map((row) => [row.id, row.manifest.name]));
    return state.tables.ai_chats.rows
      .filter((chat) => chat.archived_at === null)
      .map((chat) => ({
        id: chat.id,
        title: chat.title,
        source: chatSourceOf(chat, names).label,
        pinned: chat.pinned,
        computer: chat.engine.kind === 'claude' || chat.engine.kind === 'codex',
        ...(chat.engine.kind === 'claude' ||
        chat.engine.kind === 'codex' ||
        chat.engine.kind === 'dsh'
          ? { runtime: chat.engine.kind }
          : {}),
      }));
  },
);

function sameChats(left: readonly SearchChat[], right: readonly SearchChat[]): boolean {
  return (
    left.length === right.length &&
    left.every((chat, index) => {
      const other = right[index];
      return (
        other?.id === chat.id &&
        other.title === chat.title &&
        other.source === chat.source &&
        other.pinned === chat.pinned &&
        other.computer === chat.computer &&
        other.runtime === chat.runtime
      );
    })
  );
}

function searchTablesOf(state: StoreState): SearchTables {
  const t = state.tables;
  return {
    chats: searchChatsOf(state),
    devices: t.devices,
    rooms: t.rooms,
    deviceGroups: t.device_groups,
    scenes: t.scenes,
    automations: t.automations,
    automationRuns: t.automation_runs,
    automationValues: t.automation_values,
    automationSequences: t.automation_sequences,
    scheduled: t.scheduled_actions,
    plugins: t.plugins,
    pluginStreams: t.plugin_streams,
    extensions: undefined,
    configuration: undefined,
    inventory: undefined,
  };
}

function sameAutomationRuntimeTables(left: SearchTables, right: SearchTables): boolean {
  return (
    left.automationRuns === right.automationRuns &&
    left.automationValues === right.automationValues &&
    left.automationSequences === right.automationSequences
  );
}

function sameTables(left: SearchTables, right: SearchTables): boolean {
  return (
    left.devices === right.devices &&
    left.rooms === right.rooms &&
    left.deviceGroups === right.deviceGroups &&
    left.scenes === right.scenes &&
    left.automations === right.automations &&
    sameAutomationRuntimeTables(left, right) &&
    left.scheduled === right.scheduled &&
    left.plugins === right.plugins &&
    left.pluginStreams === right.pluginStreams &&
    sameChats(left.chats, right.chats)
  );
}

export function useSearchCatalogue(): SearchCatalogue {
  const env = useSettingEnv();
  const tables = useStoreSelector(searchTablesOf, sameTables);
  const chats = useCachedProviderChats(tables.chats, env.owner);
  const extensions = useExtensions().data;
  const configuration = useExtensionConfiguration().data;
  const inventory = useHarnessCatalogue().data;
  return catalogueFor({ ...tables, chats, extensions, configuration, inventory }, env);
}
