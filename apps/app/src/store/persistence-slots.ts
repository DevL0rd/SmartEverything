import {
  ASSISTANT_MESSAGES_SNAPSHOT,
  OWNER_SNAPSHOT_TABLES,
  SNAPSHOT_TABLES,
  type StateRow,
} from '@smarteverything/domain';
import Constants from 'expo-constants';
import { emptyState, type DeviceValues, type ListTable, type StoreState } from './state';

export const CACHE_VERSION = Constants.expoConfig?.version ?? null;
export const CACHE_LAYOUT = 'device-rows';
export const LIST_DEBOUNCE_MS = 3000;
const DEVICE_VALUES_EVERY_MS = 20_000;

export interface SlotMemo {
  readonly order: string | null;
  readonly rows: ReadonlyMap<string, unknown>;
}

export interface SlotWrite {
  readonly set: readonly (readonly [string, string])[];
  readonly del: readonly string[];
  readonly memo: SlotMemo;
}

export interface Slot {
  readonly key: string;
  readonly list: boolean;
  readonly intervalMs: number;
  readonly active: (state: StoreState) => boolean;
  readonly refs: (state: StoreState) => readonly unknown[];
  readonly write: (state: StoreState, seq: number, before: SlotMemo | undefined) => SlotWrite;
}

const UNWRITTEN = Symbol('unwritten');
const NO_ROWS: ReadonlyMap<string, unknown> = new Map();

const LIST_TABLES: ReadonlySet<string> = new Set(Object.keys(emptyState().tables));

function isListTable(name: string): name is ListTable {
  return LIST_TABLES.has(name);
}

const NOT_CACHED: ReadonlySet<string> = new Set(['commands', 'plugin_streams', 'automation_runs']);

export const SHARED_LISTS = Object.keys(SNAPSHOT_TABLES.shape).filter(isListTable);
export const CACHED_SHARED_LISTS = SHARED_LISTS.filter((name) => !NOT_CACHED.has(name));
export const OWNER_LISTS = Object.keys(OWNER_SNAPSHOT_TABLES.shape).filter(isListTable);

class MissingCachedRowError extends Error {
  override readonly name = 'MissingCachedRowError';

  constructor(
    readonly table: string,
    readonly id: string,
  ) {
    super(`The ${table} table lists the row ${id} but holds no row under that id.`);
  }
}

export function rowKey(slotKey: string, id: string): string {
  return `${slotKey}.${id}`;
}

export function unsureMemo(ids: Iterable<string>): SlotMemo {
  return { order: null, rows: new Map([...ids].map((id) => [id, UNWRITTEN])) };
}

function stateRows(device_id: string, values: DeviceValues): StateRow[] {
  const rows: StateRow[] = [];
  for (const capability in values) {
    const reading = values[capability];
    if (reading !== undefined)
      rows.push({ device_id, capability, value: reading.value, observed_at: reading.observedAt });
  }
  return rows;
}

function listIds(state: StoreState, name: ListTable): readonly string[] {
  const { ids } = state.tables[name];
  return name === 'assistant_messages' ? ids.slice(0, ASSISTANT_MESSAGES_SNAPSHOT) : ids;
}

function rowText(state: StoreState, name: ListTable, id: string, row: unknown): string {
  if (name !== 'devices') return JSON.stringify(row);
  const device = state.tables.devices.byId[id];
  if (device === undefined) throw new MissingCachedRowError(name, id);
  const { label: _label, ...stored } = device;
  return JSON.stringify(stored);
}

function whole(key: string, text: string): SlotWrite {
  return { set: [[key, text]], del: [], memo: { order: null, rows: NO_ROWS } };
}

function rowsWrite<Row>(
  key: string,
  entries: Iterable<readonly [string, Row]>,
  before: SlotMemo | undefined,
  text: (id: string, row: Row) => string,
): SlotWrite {
  const rows = new Map<string, unknown>();
  const set: (readonly [string, string])[] = [];
  for (const [id, row] of entries) {
    rows.set(id, row);
    if (before?.rows.get(id) !== row) set.push([rowKey(key, id), text(id, row)]);
  }
  const order = JSON.stringify([...rows.keys()]);
  if (before?.order !== order) set.push([key, order]);
  const del =
    before === undefined
      ? []
      : [...before.rows.keys()].filter((id) => !rows.has(id)).map((id) => rowKey(key, id));
  return { set, del, memo: { order, rows } };
}

function listSlot(base: string, prefix: 't' | 'o', name: ListTable): Slot {
  const key = `${base}.${prefix}.${name}`;
  return {
    key,
    list: true,
    intervalMs: LIST_DEBOUNCE_MS,
    active: (state) => prefix === 't' || state.session?.client.role === 'owner',
    refs: (state) => [state.tables[name]],
    write: (state, _seq, before): SlotWrite => {
      const byId: Readonly<Record<string, unknown>> = state.tables[name].byId;
      const rows = listIds(state, name).map((id): readonly [string, unknown] => {
        const row = byId[id];
        if (row === undefined) throw new MissingCachedRowError(name, id);
        return [id, row];
      });
      return rowsWrite(key, rows, before, (id, row) => rowText(state, name, id, row));
    },
  };
}

export function deviceStateKey(base: string): string {
  return `${base}.device_state`;
}

function deviceStateSlot(base: string): Slot {
  const key = deviceStateKey(base);
  return {
    key,
    list: true,
    intervalMs: DEVICE_VALUES_EVERY_MS,
    active: () => true,
    refs: (state) => [state.deviceValues],
    write: (state, _seq, before): SlotWrite =>
      rowsWrite(key, state.deviceValues.entries(), before, (id, values) =>
        JSON.stringify(stateRows(id, values)),
      ),
  };
}

export function metaKey(base: string): string {
  return `${base}.meta`;
}

export function stateKey(base: string): string {
  return `${base}.state`;
}

export function slotsOf(base: string): readonly Slot[] {
  return [
    {
      key: stateKey(base),
      list: false,
      intervalMs: LIST_DEBOUNCE_MS,
      active: () => true,
      refs: (state) => [
        state.settings,
        state.session,
        state.firewall,
        state.weather,
        state.exchangeRates,
        state.assistant,
      ],
      write: (state): SlotWrite => {
        const { session, firewall, settings, weather, exchangeRates, assistant } = state;
        return whole(
          stateKey(base),
          JSON.stringify({
            session,
            firewall,
            tables: {
              settings,
              ...(weather === null ? {} : { weather }),
              ...(exchangeRates === null ? {} : { exchange_rates: exchangeRates }),
              ...(assistant === null ? {} : { assistant_status: assistant }),
            },
          }),
        );
      },
    },
    deviceStateSlot(base),
    ...CACHED_SHARED_LISTS.map((name) => listSlot(base, 't', name)),
    ...OWNER_LISTS.map((name) => listSlot(base, 'o', name)),
  ];
}

export function metaSlot(base: string): Slot {
  return {
    key: metaKey(base),
    list: false,
    intervalMs: LIST_DEBOUNCE_MS,
    active: () => true,
    refs: () => [],
    write: (_state, seq) =>
      whole(metaKey(base), JSON.stringify({ version: CACHE_VERSION, layout: CACHE_LAYOUT, seq })),
  };
}
