import {
  displayName,
  type RowChange,
  type Snapshot,
  type StateRow,
  type TableRow,
} from '@smarteverything/domain';
import {
  deviceOf,
  makeTable,
  rowsOf,
  type DeviceValues,
  type ListTable,
  type RowOf,
  type StoreState,
  type Table,
  type Tables,
} from './state';
import { turnsOf } from './chat-turns';
import { sameJson } from './same-json';
import { shareOf, shareTables, shareValues } from './share';
import { RULES, type TableRule } from './table-rules';

export class UnreadableChangeError extends Error {
  override readonly name = 'UnreadableChangeError';

  constructor(
    readonly table: string,
    readonly reason: string,
  ) {
    super(`A live change to ${table} could not be applied: ${reason}.`);
  }
}

function tableOf<R>(rows: readonly R[], rule: TableRule<R>, version: number): Table<R> {
  const sorted = [...rows].sort(rule.order).slice(0, rule.keep);
  const byId: Record<string, R> = {};
  for (const row of sorted) {
    byId[rule.idOf(row)] = row;
  }
  return makeTable(byId, sorted.map(rule.idOf), version);
}

function upsert<R>(table: Table<R>, row: R, rule: TableRule<R>): Table<R> {
  const id = rule.idOf(row);
  const known = table.byId[id];
  if (known !== undefined && sameJson(known, row)) {
    return table;
  }
  const others = table.ids.flatMap((other) => {
    const existing = table.byId[other];
    return other === id || existing === undefined ? [] : [existing];
  });
  return tableOf([...others, row], rule, table.version + 1);
}

function remove<R>(table: Table<R>, id: string): Table<R> {
  if (table.byId[id] === undefined) {
    return table;
  }
  const byId = Object.fromEntries(Object.entries(table.byId).filter(([key]) => key !== id));
  return makeTable(
    byId,
    table.ids.filter((other) => other !== id),
    table.version + 1,
  );
}

interface Change<R> {
  readonly table: string;
  readonly operation: RowChange['operation'];
  readonly record: R | null;
  readonly oldRecord: R | null;
}

function applyList<R>(table: Table<R>, change: Change<R>, rule: TableRule<R>): Table<R> {
  if (change.operation === 'DELETE') {
    if (change.oldRecord === null) {
      throw new UnreadableChangeError(change.table, 'a DELETE arrived without the removed row');
    }
    return remove(table, rule.idOf(change.oldRecord));
  }
  if (change.record === null) {
    throw new UnreadableChangeError(change.table, `an ${change.operation} arrived without a row`);
  }
  return upsert(table, change.record, rule);
}

function withTable<T extends ListTable>(tables: Tables, name: T, table: Table<RowOf<T>>): Tables {
  return table === tables[name] ? tables : { ...tables, [name]: table };
}

function withTables(state: StoreState, tables: Tables): StoreState {
  return tables === state.tables ? state : { ...state, tables };
}

function valuesWith(
  values: Readonly<Record<string, DeviceValues>>,
  row: StateRow,
  removed: boolean,
): Readonly<Record<string, DeviceValues>> {
  const current = values[row.device_id] ?? {};
  const known = current[row.capability];
  if (
    !removed &&
    known?.optimistic !== true &&
    known?.observedAt === row.observed_at &&
    sameJson(known.value, row.value)
  ) {
    return values;
  }
  if (removed) {
    const next = Object.fromEntries(
      Object.entries(current).filter(([capability]) => capability !== row.capability),
    );
    return { ...values, [row.device_id]: next };
  }
  return {
    ...values,
    [row.device_id]: {
      ...current,
      [row.capability]: { value: row.value, observedAt: row.observed_at },
    },
  };
}

function applyState(
  state: StoreState,
  change: Extract<RowChange, { table: 'device_state' }>,
): StoreState {
  const row = change.operation === 'DELETE' ? change.oldRecord : change.record;
  if (row === null) {
    throw new UnreadableChangeError(change.table, `a ${change.operation} arrived without a row`);
  }
  const deviceValues = valuesWith(state.deviceValues, row, change.operation === 'DELETE');
  return deviceValues === state.deviceValues ? state : { ...state, deviceValues };
}

function applySettings(
  state: StoreState,
  change: Extract<RowChange, { table: 'settings' }>,
): StoreState {
  if (change.record === null) {
    throw new UnreadableChangeError(change.table, 'the settings row arrived empty');
  }
  return sameJson(state.settings, change.record) ? state : { ...state, settings: change.record };
}

function applyWeather(
  state: StoreState,
  change: Extract<RowChange, { table: 'weather' }>,
): StoreState {
  if (change.record === null) {
    throw new UnreadableChangeError(change.table, 'the weather row arrived empty');
  }
  return sameJson(state.weather, change.record) ? state : { ...state, weather: change.record };
}

function applyExchangeRates(
  state: StoreState,
  change: Extract<RowChange, { table: 'exchange_rates' }>,
): StoreState {
  if (change.record === null) {
    throw new UnreadableChangeError(change.table, 'the exchange rates row arrived empty');
  }
  return sameJson(state.exchangeRates, change.record)
    ? state
    : { ...state, exchangeRates: change.record };
}

function applyClient(
  state: StoreState,
  change: Extract<RowChange, { table: 'clients' }>,
): StoreState {
  const tables = withTable(
    state.tables,
    'clients',
    applyList(state.tables.clients, change, RULES.clients),
  );
  const own = state.session === null ? undefined : tables.clients.byId[state.session.client.id];
  const session =
    state.session === null || own === undefined ? state.session : { ...state.session, client: own };
  return { ...state, tables, session };
}

function applyDevice(
  state: StoreState,
  change: Extract<RowChange, { table: 'devices' }>,
): StoreState {
  const mapped: Change<RowOf<'devices'>> = {
    table: change.table,
    operation: change.operation,
    record: change.record === null ? null : deviceOf(change.record),
    oldRecord: change.oldRecord === null ? null : deviceOf(change.oldRecord),
  };
  return withTables(
    state,
    withTable(state.tables, 'devices', applyList(state.tables.devices, mapped, RULES.devices)),
  );
}

function applyListChange<T extends ListTable>(
  state: StoreState,
  name: T,
  change: Change<RowOf<T>>,
): StoreState {
  return withTables(
    state,
    withTable(state.tables, name, applyList(state.tables[name], change, RULES[name])),
  );
}

function grantedClient(row: TableRow<'oauth_clients'> | null): TableRow<'oauth_clients'> | null {
  return row?.revoked_at === null && row.granted_at !== null ? row : null;
}

function applyOAuthClient(
  state: StoreState,
  change: Extract<RowChange, { table: 'oauth_clients' }>,
): StoreState {
  const kept = grantedClient(change.record);
  const removed = change.oldRecord ?? change.record;
  if (change.operation !== 'DELETE' && kept === null) {
    return removed === null
      ? state
      : {
          ...state,
          tables: withTable(
            state.tables,
            'oauth_clients',
            remove(state.tables.oauth_clients, removed.id),
          ),
        };
  }
  return applyListChange(state, 'oauth_clients', change);
}

type ChangeMap = { readonly [T in RowChange['table']]: Extract<RowChange, { readonly table: T }> };

type Applier<T extends RowChange['table']> = (
  state: StoreState,
  change: ChangeMap[T],
) => StoreState;

function list<T extends Exclude<ListTable, 'devices' | 'clients'>>(
  name: T,
): (state: StoreState, change: Change<RowOf<T>>) => StoreState {
  return (state, change) => applyListChange(state, name, change);
}

const APPLIERS: { readonly [T in RowChange['table']]: Applier<T> } = {
  settings: applySettings,
  device_state: applyState,
  state_history: (state) => state,
  clients: applyClient,
  devices: applyDevice,
  provider_links: list('provider_links'),
  rooms: list('rooms'),
  commands: list('commands'),
  events: list('events'),
  cameras: list('cameras'),
  recordings: list('recordings'),
  ir_remotes: list('ir_remotes'),
  ir_codes: list('ir_codes'),
  scenes: list('scenes'),
  automations: list('automations'),
  layouts: list('layouts'),
  push_targets: list('push_targets'),
  health_sources: list('health_sources'),
  health_daily: list('health_daily'),
  mcp_tokens: list('mcp_tokens'),
  oauth_clients: applyOAuthClient,
  profiles: list('profiles'),
  body_readings: list('body_readings'),
  talk_channels: list('talk_channels'),
  talk_members: list('talk_members'),
  talk_messages: list('talk_messages'),
  assistant_messages: list('assistant_messages'),
  ai_chats: list('ai_chats'),
  scheduled_actions: list('scheduled_actions'),
  ai_usage: list('ai_usage'),
  plugins: list('plugins'),
  plugin_streams: list('plugin_streams'),
  health_entries: (state) => state,
  foods: (state) => state,
  watch_days: (state) => state,
  ai_outreach: (state) => state,
  weather: applyWeather,
  exchange_rates: applyExchangeRates,
};

function applyTo<T extends RowChange['table']>(
  state: StoreState,
  table: T,
  change: ChangeMap[T],
): StoreState {
  const apply: Applier<T> = APPLIERS[table];
  return apply(state, change);
}

function relabel(state: StoreState): StoreState {
  const table = state.tables.devices;
  const devices = rowsOf(table);
  const rooms = rowsOf(state.tables.rooms);
  let changed = false;
  const byId: Record<string, RowOf<'devices'>> = {};
  for (const device of devices) {
    const label = displayName(device, devices, rooms);
    changed ||= label !== device.label;
    byId[device.id] = label === device.label ? device : { ...device, label };
  }
  if (!changed) {
    return state;
  }
  const relabelled = tableOf(Object.values(byId), RULES.devices, table.version + 1);
  return { ...state, tables: withTable(state.tables, 'devices', relabelled) };
}

const LABEL_TABLES: ReadonlySet<RowChange['table']> = new Set(['devices', 'rooms']);

export function applyChange(state: StoreState, change: RowChange): StoreState {
  const next = applyTo(state, change.table, change);
  return LABEL_TABLES.has(change.table) ? relabel(next) : next;
}

function valuesOf(rows: readonly StateRow[]): Readonly<Record<string, DeviceValues>> {
  const values: Record<string, Record<string, DeviceValues[string]>> = {};
  for (const row of rows) {
    values[row.device_id] = {
      ...values[row.device_id],
      [row.capability]: { value: row.value, observedAt: row.observed_at },
    };
  }
  return values;
}

type NextTable = <T extends ListTable>(name: T, rows: readonly RowOf<T>[]) => Table<RowOf<T>>;

function talkTablesOf(
  snapshot: Snapshot,
  next: NextTable,
): Pick<
  Tables,
  'talk_channels' | 'talk_members' | 'talk_messages' | 'assistant_messages' | 'ai_chats'
> {
  const t = snapshot.tables;
  return {
    talk_channels: next('talk_channels', t.talk_channels ?? []),
    talk_members: next('talk_members', t.talk_members ?? []),
    talk_messages: next('talk_messages', t.talk_messages ?? []),
    assistant_messages: next('assistant_messages', t.assistant_messages ?? []),
    ai_chats: next('ai_chats', t.ai_chats ?? []),
  };
}

function pluginTablesOf(
  snapshot: Snapshot,
  next: NextTable,
): Pick<Tables, 'plugins' | 'plugin_streams'> {
  return {
    plugins: next('plugins', snapshot.owner?.plugins ?? []),
    plugin_streams: next('plugin_streams', snapshot.tables.plugin_streams ?? []),
  };
}

function tablesOf(snapshot: Snapshot, previous: Tables): Tables {
  const t = snapshot.tables;
  const owner = snapshot.owner;
  const next = <T extends ListTable>(name: T, rows: readonly RowOf<T>[]): Table<RowOf<T>> =>
    tableOf(rows, RULES[name], previous[name].version + 1);
  return {
    clients: next('clients', owner?.clients ?? [snapshot.session.client]),
    provider_links: next('provider_links', t.provider_links),
    rooms: next('rooms', t.rooms),
    devices: next('devices', t.devices.map(deviceOf)),
    commands: next('commands', t.commands),
    events: next('events', t.events),
    cameras: next('cameras', t.cameras),
    recordings: next('recordings', t.recordings),
    ir_remotes: next('ir_remotes', t.ir_remotes),
    ir_codes: next('ir_codes', t.ir_codes),
    scenes: next('scenes', t.scenes),
    automations: next('automations', t.automations),
    layouts: next('layouts', t.layouts),
    push_targets: next('push_targets', owner?.push_targets ?? []),
    health_sources: next('health_sources', t.health_sources),
    health_daily: next('health_daily', t.health_daily),
    mcp_tokens: next('mcp_tokens', owner?.mcp_tokens ?? []),
    oauth_clients: next(
      'oauth_clients',
      (owner?.oauth_clients ?? []).filter((row) => grantedClient(row) !== null),
    ),
    profiles: next('profiles', t.profiles),
    body_readings: next('body_readings', t.body_readings),
    ...talkTablesOf(snapshot, next),
    scheduled_actions: next('scheduled_actions', t.scheduled_actions ?? []),
    ai_usage: previous.ai_usage,
    ...pluginTablesOf(snapshot, next),
  };
}

export function replaceWith(state: StoreState, snapshot: Snapshot): StoreState {
  const next = relabel({
    ...state,
    loaded: true,
    tables: tablesOf(snapshot, state.tables),
    settings: shareOf(state.settings, snapshot.tables.settings),
    weather: shareOf(state.weather, snapshot.tables.weather ?? null),
    exchangeRates: shareOf(state.exchangeRates, snapshot.tables.exchange_rates ?? null),
    talkPresence: shareOf(state.talkPresence, snapshot.tables.talk_presence ?? state.talkPresence),
    assistant: shareOf(state.assistant, snapshot.tables.assistant_status ?? null),
    turns: shareOf(state.turns, turnsOf(snapshot.tables.chat_activity ?? [])),
    session: shareOf(state.session, snapshot.session),
    deviceValues: shareValues(state.deviceValues, valuesOf(snapshot.tables.device_state)),
    hub: shareOf(state.hub, snapshot.session.hub),
    firewall: shareOf(state.firewall, snapshot.firewall),
    sync: { ...state.sync, seq: snapshot.seq },
  });
  return { ...next, tables: shareTables(state.tables, next.tables) };
}
