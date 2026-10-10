import type { PresentedCapability, SearchEntry } from '@smarteverything/domain';
import type { TextRange } from '../components/highlighted';
import { deviceIdOf, type SearchCatalogue } from './catalogue';

export const RESULT_GROUPS = [
  'devices',
  'pages',
  'settings',
  'rooms',
  'routines',
  'plugins',
] as const;

export type ResultGroup = (typeof RESULT_GROUPS)[number];

export const RESULT_GROUP_LABELS: Readonly<Record<ResultGroup, string>> = {
  devices: 'Devices',
  pages: 'Pages',
  settings: 'Settings',
  rooms: 'Rooms',
  routines: 'Scenes & automations',
  plugins: 'Plugins',
};

export type NodeItem =
  | { readonly kind: 'entry'; readonly entry: SearchEntry; readonly title: string }
  | {
      readonly kind: 'capability';
      readonly deviceId: string;
      readonly presented: PresentedCapability;
    }
  | {
      readonly kind: 'phrase';
      readonly deviceId: string;
      readonly entry: SearchEntry;
      readonly phrase: string;
    };

export interface ResultNode {
  readonly key: string;
  readonly item: NodeItem;
  readonly score: number;
  readonly hit: boolean;
  readonly found: boolean;
  readonly range: TextRange | null;
  readonly children: readonly ResultNode[];
}

export interface ResultBranch {
  readonly group: ResultGroup;
  readonly label: string;
  readonly roots: readonly ResultNode[];
}

export function groupOf(entry: SearchEntry, catalogue: SearchCatalogue): ResultGroup {
  if (catalogue.plugins.has(entry.id)) {
    return 'plugins';
  }
  if (deviceIdOf(entry) !== null) {
    return 'devices';
  }
  switch (entry.group) {
    case 'setting':
      return 'settings';
    case 'room':
      return 'rooms';
    case 'scene':
    case 'automation':
      return 'routines';
    case 'device':
    case 'action':
      return 'devices';
    case 'page':
      return 'pages';
  }
}

function phraseOf(entry: SearchEntry, deviceName: string): string {
  const suffix = ` — ${deviceName}`;
  return entry.title.endsWith(suffix) ? entry.title.slice(0, -suffix.length) : entry.title;
}

export function entryTitle(entry: SearchEntry, catalogue: SearchCatalogue): string {
  const deviceId = entry.group === 'device' ? null : deviceIdOf(entry);
  const named = deviceId === null ? undefined : catalogue.devices.get(deviceId);
  return named === undefined ? entry.title : phraseOf(entry, named.name);
}

export function entryItem(entry: SearchEntry, catalogue: SearchCatalogue): NodeItem {
  const control = catalogue.controls.get(entry.id);
  return control === undefined
    ? { kind: 'entry', entry, title: entryTitle(entry, catalogue) }
    : { kind: 'capability', ...control };
}

export function leafOf(entry: SearchEntry, catalogue: SearchCatalogue): ResultNode {
  return {
    key: entry.id,
    item: entryItem(entry, catalogue),
    score: 0,
    hit: false,
    found: false,
    range: null,
    children: [],
  };
}

export function titleOf(item: NodeItem): string {
  switch (item.kind) {
    case 'entry':
      return item.title;
    case 'capability':
      return item.presented.label;
    case 'phrase':
      return item.phrase;
  }
}
