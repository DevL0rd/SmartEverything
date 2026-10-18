import type { Turns } from './chat-turns';
import { DeviceValueIndex } from './device-values';
import { deviceValuesRecord, ledgerOfDevice, rawState } from './subscriptions';
import type {
  AssistantStatus,
  DeviceRow,
  FirewallStatus,
  HubStatus,
  JsonValue,
  LiveTable,
  McpConsentRequest,
  SettingsRow,
  SmartThingsWebhook,
  TalkPresence,
  Snapshot,
  TableRow,
  WeatherRow,
  ExchangeRatesRow,
} from '@smarteverything/domain';

export interface Device extends DeviceRow {
  readonly label: string;
}

export function deviceOf(row: DeviceRow): Device {
  return { ...row, label: row.display_name ?? row.name };
}

export type ListTable = Exclude<
  LiveTable,
  | 'settings'
  | 'device_state'
  | 'state_history'
  | 'health_entries'
  | 'foods'
  | 'watch_days'
  | 'weather'
  | 'exchange_rates'
  | 'ai_outreach'
  | 'device_effect_targets'
>;

export type RowOf<T extends ListTable> = T extends 'devices' ? Device : TableRow<T>;

export type NextTable = <T extends ListTable>(
  name: T,
  rows: readonly RowOf<T>[],
) => Table<RowOf<T>>;

export interface Table<R> {
  readonly byId: Readonly<Record<string, R>>;
  readonly ids: readonly string[];
  readonly rows: readonly R[];
  readonly version: number;
}

export function makeTable<R>(
  byId: Readonly<Record<string, R>>,
  ids: readonly string[],
  version: number,
): Table<R> {
  const rows: R[] = [];
  ids.forEach((id) => {
    const row = byId[id];
    if (row !== undefined) rows.push(row);
  });
  return { byId, ids, rows, version };
}

export type Tables = { readonly [T in ListTable]: Table<RowOf<T>> };

export interface DeviceValue {
  readonly optimistic?: true;
  readonly value: JsonValue;
  readonly observedAt: string;
}

export type DeviceValues = Readonly<Record<string, DeviceValue>>;

type SyncPhase = 'connecting' | 'loading' | 'live' | 'interrupted' | 'refused';

export interface SyncState {
  readonly status: SyncPhase;
  readonly seq: number | null;
  readonly problem: string | null;
  readonly outdated: readonly string[];
  readonly offlineSince: number | null;
}

export type Session = Snapshot['session'];

export interface LedgerEntry {
  readonly requestedAt?: string;
  readonly commandId: string | null;
  readonly value: JsonValue | null;
  readonly expiresAt: string | null;
  readonly failure: string | null;
}

export interface StoreState {
  readonly loaded: boolean;
  readonly tables: Tables;
  readonly settings: SettingsRow | null;
  readonly weather: WeatherRow | null;
  readonly exchangeRates: ExchangeRatesRow | null;
  readonly talkPresence: TalkPresence;
  readonly assistant: AssistantStatus | null;
  readonly turns: Turns;
  readonly session: Session | null;
  readonly deviceValues: DeviceValueIndex;
  readonly sync: SyncState;
  readonly hub: HubStatus | null;
  readonly firewall: FirewallStatus | null;
  readonly smartthingsWebhook: SmartThingsWebhook | null;
  readonly serviceLog: readonly string[];
  readonly consentRequests: readonly McpConsentRequest[];
  readonly ledger: Readonly<Record<string, LedgerEntry>>;
}

function emptyTable<R>(): Table<R> {
  return makeTable({}, [], 0);
}

function emptyTables(): Tables {
  return {
    clients: emptyTable(),
    provider_links: emptyTable(),
    rooms: emptyTable(),
    device_groups: emptyTable(),
    devices: emptyTable(),
    television_settings: emptyTable(),
    commands: emptyTable(),
    events: emptyTable(),
    cameras: emptyTable(),
    recordings: emptyTable(),
    ir_remotes: emptyTable(),
    ir_codes: emptyTable(),
    scenes: emptyTable(),
    automations: emptyTable(),
    automation_values: emptyTable(),
    automation_runs: emptyTable(),
    layouts: emptyTable(),
    push_targets: emptyTable(),
    health_sources: emptyTable(),
    health_daily: emptyTable(),
    mcp_tokens: emptyTable(),
    oauth_clients: emptyTable(),
    profiles: emptyTable(),
    body_readings: emptyTable(),
    talk_channels: emptyTable(),
    talk_members: emptyTable(),
    talk_messages: emptyTable(),
    assistant_messages: emptyTable(),
    ai_chats: emptyTable(),
    scheduled_actions: emptyTable(),
    ai_usage: emptyTable(),
    plugins: emptyTable(),
    plugin_streams: emptyTable(),
  };
}

export function emptyState(): StoreState {
  return {
    loaded: false,
    tables: emptyTables(),
    settings: null,
    weather: null,
    exchangeRates: null,
    talkPresence: { floors: [], online: [] },
    assistant: null,
    turns: {},
    session: null,
    deviceValues: DeviceValueIndex.empty,
    sync: {
      status: 'connecting',
      seq: null,
      problem: null,
      outdated: [],
      offlineSince: Date.now(),
    },
    hub: null,
    firewall: null,
    smartthingsWebhook: null,
    serviceLog: [],
    consentRequests: [],
    ledger: {},
  };
}

const NO_VALUES: DeviceValues = {};

const projectedValues = new WeakMap<StoreState, Map<string, DeviceValues>>();

type PendingEntry = readonly [capability: string, entry: LedgerEntry];

interface ProjectionNode {
  readonly entries: Map<string, WeakMap<LedgerEntry, ProjectionNode>>;
  values: DeviceValues | undefined;
}

const ledgerEntries = new WeakMap<
  StoreState['ledger'],
  ReadonlyMap<string, readonly PendingEntry[]>
>();
const reportedProjections = new WeakMap<DeviceValues, ProjectionNode>();

function entriesByDevice(
  ledger: StoreState['ledger'],
): ReadonlyMap<string, readonly PendingEntry[]> {
  const known = ledgerEntries.get(ledger);
  if (known !== undefined) return known;
  const devices = new Map<string, PendingEntry[]>();
  for (const [slot, entry] of Object.entries(ledger)) {
    if (entry.failure !== null || entry.value === null) continue;
    const separator = slot.lastIndexOf('/');
    const deviceId = slot.slice(0, separator);
    const entries = devices.get(deviceId) ?? [];
    entries.push([slot.slice(separator + 1), entry]);
    devices.set(deviceId, entries);
  }
  ledgerEntries.set(ledger, devices);
  return devices;
}

function projectionNode(reported: DeviceValues, entries: readonly PendingEntry[]): ProjectionNode {
  let node: ProjectionNode = reportedProjections.get(reported) ?? {
    entries: new Map(),
    values: undefined,
  };
  reportedProjections.set(reported, node);
  for (const [capability, entry] of entries) {
    const generations = node.entries.get(capability) ?? new WeakMap<LedgerEntry, ProjectionNode>();
    node.entries.set(capability, generations);
    const next: ProjectionNode = generations.get(entry) ?? {
      entries: new Map(),
      values: undefined,
    };
    generations.set(entry, next);
    node = next;
  }
  return node;
}

function pendingValues(reported: DeviceValues, entries: readonly PendingEntry[]): DeviceValues {
  if (entries.length === 0) return reported;
  const node = projectionNode(reported, entries);
  if (node.values !== undefined) return node.values;
  const pending: Record<string, DeviceValue> = {};
  for (const [capability, entry] of entries) {
    const observedAt = entry.requestedAt ?? reported[capability]?.observedAt;
    if (observedAt !== undefined && entry.value !== null)
      pending[capability] = { value: entry.value, observedAt, optimistic: true };
  }
  node.values = { ...reported, ...pending };
  return node.values;
}

export function deviceValuesOf(state: StoreState, deviceId: string): DeviceValues {
  const reported = deviceValuesRecord(state, deviceId) ?? NO_VALUES;
  const ledger = ledgerOfDevice(state, deviceId);
  const raw = rawState(state);
  const cache = projectedValues.get(raw) ?? new Map<string, DeviceValues>();
  projectedValues.set(raw, cache);
  const known = cache.get(deviceId);
  if (known !== undefined) return known;
  const values = pendingValues(reported, entriesByDevice(ledger).get(deviceId) ?? []);
  cache.set(deviceId, values);
  return values;
}

export function rowsOf<R>(table: Table<R>): readonly R[] {
  return table.rows;
}
