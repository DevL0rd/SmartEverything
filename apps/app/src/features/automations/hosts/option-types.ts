import type { DeviceGroupRow, JsonValue } from '@smarteverything/domain';
import type { Device } from '../../../store/state';

export interface OptionRow {
  readonly id: string;
  readonly label: string;
  readonly icon?: string;
  readonly detail?: string;
  readonly unavailable?: string;
}

export type OptionResult =
  | { readonly status: 'ready'; readonly options: readonly OptionRow[] }
  | { readonly status: 'loading' }
  | { readonly status: 'unavailable'; readonly reason: string };

export interface PluginPick {
  readonly pluginId: string;
  readonly source: string;
}

export interface AutomationScope {
  readonly variables: readonly OptionRow[];
  readonly triggers: readonly OptionRow[];
  readonly timers: readonly OptionRow[];
  readonly events: readonly OptionRow[];
}

export interface OptionContext {
  readonly values: Readonly<Record<string, JsonValue>>;
  readonly target: readonly string[];
  readonly wholeHome?: boolean;
  readonly search: string;
  readonly fields?: readonly string[];
  readonly scope?: AutomationScope;
  readonly plugin?: PluginPick;
}

export interface Named {
  readonly id: string;
  readonly name: string;
}

export interface HomeData {
  readonly devices: readonly Device[];
  readonly rooms: readonly Named[];
  readonly groups: readonly DeviceGroupRow[];
  readonly scenes: readonly Named[];
  readonly people: readonly Named[];
  readonly chats: readonly { readonly id: string; readonly title: string }[];
  readonly channels: readonly Named[];
  readonly values: readonly { readonly id: string; readonly content: { readonly name: string } }[];
  readonly automations: readonly Named[];
  readonly timeZones: readonly string[] | null;
}

export type SignalLevel = 'sources' | 'kinds' | 'subjects' | 'fields';

export type ClientFetchKind =
  | 'computer_apps'
  | 'audio_devices'
  | 'audio_apps'
  | 'displays'
  | 'services'
  | 'keyboard_layouts'
  | 'startup_apps'
  | 'wifi_networks'
  | 'bluetooth_devices'
  | 'phone_apps'
  | 'vacuum_rooms';

export type RemoteFetch =
  | { readonly t: 'ir_remotes' }
  | { readonly t: 'ir_buttons'; readonly remoteId: string }
  | { readonly t: 'ir_appliances' }
  | { readonly t: 'processes'; readonly deviceId: string; readonly search: string }
  | {
      readonly t: 'signals';
      readonly level: SignalLevel;
      readonly source: string;
      readonly kind: string;
    }
  | { readonly t: 'speech' }
  | { readonly t: 'listening' }
  | { readonly t: ClientFetchKind; readonly deviceId: string }
  | { readonly t: 'models'; readonly kind: 'chat' | 'image'; readonly search: string }
  | {
      readonly t: 'plugin';
      readonly pluginId: string;
      readonly source: string;
      readonly search: string;
    };

export type RemoteNeed =
  | { readonly kind: 'none' }
  | { readonly kind: 'blocked'; readonly reason: string }
  | { readonly kind: 'fetch'; readonly fetch: RemoteFetch };

export type RemoteState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly reason: string }
  | { readonly status: 'ready'; readonly rows: readonly OptionRow[] };

export function ready(options: readonly OptionRow[]): OptionResult {
  return { status: 'ready', options };
}

export function unavailable(reason: string): OptionResult {
  return { status: 'unavailable', reason };
}

export function textOf(value: JsonValue | undefined): string {
  return typeof value === 'string' ? value : '';
}

function matches(text: string | undefined, needle: string): boolean {
  return text?.toLowerCase().includes(needle) === true;
}

export function searchRows(rows: readonly OptionRow[], search: string): readonly OptionRow[] {
  const needle = search.trim().toLowerCase();
  if (needle === '') return rows;
  return rows.filter(
    (row) => matches(row.label, needle) || matches(row.detail, needle) || matches(row.id, needle),
  );
}

export function named(rows: readonly Named[]): readonly OptionRow[] {
  return rows.map((row) => ({ id: row.id, label: row.name }));
}

export function humanise(id: string): string {
  const spaced = id.replaceAll('_', ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function plain(ids: readonly string[]): readonly OptionRow[] {
  return ids.map((id) => ({ id, label: humanise(id) }));
}
