import {
  ASSISTANT_MESSAGES_SNAPSHOT,
  OWNER_SNAPSHOT_TABLES,
  SNAPSHOT_TABLES,
  type StateRow,
} from '@smarteverything/domain';
import Constants from 'expo-constants';
import { emptyState, type ListTable, type StoreState } from './state';

export const CACHE_VERSION = Constants.expoConfig?.version ?? null;
export const LIST_DEBOUNCE_MS = 3000;
const DEVICE_VALUES_EVERY_MS = 20_000;

export interface Slot {
  readonly key: string;
  readonly intervalMs: number;
  readonly active: (state: StoreState) => boolean;
  readonly refs: (state: StoreState) => readonly unknown[];
  readonly text: (state: StoreState, seq: number) => string;
}

const LIST_TABLES: ReadonlySet<string> = new Set(Object.keys(emptyState().tables));

function isListTable(name: string): name is ListTable {
  return LIST_TABLES.has(name);
}

const NOT_CACHED: ReadonlySet<string> = new Set(['commands', 'plugin_streams', 'automation_runs']);

export const SHARED_LISTS = Object.keys(SNAPSHOT_TABLES.shape).filter(isListTable);
export const CACHED_SHARED_LISTS = SHARED_LISTS.filter((name) => !NOT_CACHED.has(name));
export const OWNER_LISTS = Object.keys(OWNER_SNAPSHOT_TABLES.shape).filter(isListTable);

function stateRows(deviceValues: StoreState['deviceValues']): StateRow[] {
  const rows: StateRow[] = [];
  for (const [device_id, values] of deviceValues.entries()) {
    for (const capability in values) {
      const reading = values[capability];
      if (reading !== undefined)
        rows.push({ device_id, capability, value: reading.value, observed_at: reading.observedAt });
    }
  }
  return rows;
}

function listRows(state: StoreState, name: ListTable): readonly unknown[] {
  const { rows } = state.tables[name];
  if (name === 'devices') {
    return state.tables.devices.rows.map(({ label: _label, ...row }) => row);
  }
  return name === 'assistant_messages' ? rows.slice(0, ASSISTANT_MESSAGES_SNAPSHOT) : rows;
}

function metaOf(state: StoreState, seq: number): string {
  const { session, firewall, settings, weather, exchangeRates, assistant } = state;
  return JSON.stringify({
    version: CACHE_VERSION,
    seq,
    session,
    firewall,
    tables: {
      settings,
      ...(weather === null ? {} : { weather }),
      ...(exchangeRates === null ? {} : { exchange_rates: exchangeRates }),
      ...(assistant === null ? {} : { assistant_status: assistant }),
    },
  });
}

function listSlot(base: string, prefix: 't' | 'o', name: ListTable): Slot {
  return {
    key: `${base}.${prefix}.${name}`,
    intervalMs: LIST_DEBOUNCE_MS,
    active: (state) => prefix === 't' || state.session?.client.role === 'owner',
    refs: (state) => [state.tables[name]],
    text: (state) => JSON.stringify(listRows(state, name)),
  };
}

export function metaKey(base: string): string {
  return `${base}.meta`;
}

export function slotsOf(base: string): readonly Slot[] {
  return [
    {
      key: `${base}.device_state`,
      intervalMs: DEVICE_VALUES_EVERY_MS,
      active: () => true,
      refs: (state) => [state.deviceValues],
      text: (state) => JSON.stringify(stateRows(state.deviceValues)),
    },
    ...CACHED_SHARED_LISTS.map((name) => listSlot(base, 't', name)),
    ...OWNER_LISTS.map((name) => listSlot(base, 'o', name)),
  ];
}

export function metaSlot(base: string): Slot {
  return {
    key: metaKey(base),
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
    text: metaOf,
  };
}
