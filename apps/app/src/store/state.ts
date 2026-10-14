import type { Turns } from './chat-turns';
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
>;

export type RowOf<T extends ListTable> = T extends 'devices' ? Device : TableRow<T>;

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
  const rows = ids.flatMap((id) => {
    const row = byId[id];
    return row === undefined ? [] : [row];
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
}

export type Session = Snapshot['session'];

export interface LedgerEntry {
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
  readonly deviceValues: Readonly<Record<string, DeviceValues>>;
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
    devices: emptyTable(),
    commands: emptyTable(),
    events: emptyTable(),
    cameras: emptyTable(),
    recordings: emptyTable(),
    ir_remotes: emptyTable(),
    ir_codes: emptyTable(),
    scenes: emptyTable(),
    automations: emptyTable(),
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
    deviceValues: {},
    sync: { status: 'connecting', seq: null, problem: null, outdated: [] },
    hub: null,
    firewall: null,
    smartthingsWebhook: null,
    serviceLog: [],
    consentRequests: [],
    ledger: {},
  };
}

const NO_VALUES: DeviceValues = {};

export function deviceValuesOf(state: StoreState, deviceId: string): DeviceValues {
  return state.deviceValues[deviceId] ?? NO_VALUES;
}

export function rowsOf<R>(table: Table<R>): readonly R[] {
  return table.rows;
}
