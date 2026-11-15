import {
  LIVE_ROW_KEYS,
  ROW_CHANGE,
  mergedColumns,
  type LiveChange,
  type LiveTable,
  type LiveWireChange,
  type RowChange,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { LogTally } from '../design/log-tally';
import { applyChange, UnreadableChangeError } from './live-reducers';
import { sameJson } from './same-json';
import type { ListTable, StoreState } from './state';
import { RULES } from './table-rules';

type Columns = Readonly<Record<string, unknown>>;

type Update = Extract<LiveWireChange, { readonly operation: 'UPDATE' }>;

const tally = new LogTally(new Logger('app.live'), 'live.unheld_summarised', 5000);

const LIST_TABLES: ReadonlySet<string> = new Set(Object.keys(RULES));

function isListTable(table: LiveTable): table is ListTable {
  return LIST_TABLES.has(table);
}

function keyMatches(row: object, key: Columns): boolean {
  return Object.entries(key).every(
    ([column, value]) => Object.hasOwn(row, column) && sameJson(Reflect.get(row, column), value),
  );
}

function heldState(state: StoreState, key: Columns): Columns | null {
  const { device_id: device, capability } = key;
  if (typeof device !== 'string' || typeof capability !== 'string') return null;
  const known = state.deviceValues.get(device)?.[capability];
  if (known === undefined) return null;
  return { device_id: device, capability, value: known.value, observed_at: known.observedAt };
}

function heldRowOf(state: StoreState, change: Update): object | null {
  const { table, key } = change;
  if (table === 'settings') return state.settings;
  if (table === 'weather') return state.weather;
  if (table === 'exchange_rates') return state.exchangeRates;
  if (table === 'device_state') return heldState(state, key);
  if (!isListTable(table)) return null;
  const rows: readonly object[] = state.tables[table].rows;
  return rows.find((row) => keyMatches(row, key)) ?? null;
}

function resolvedUpdate(change: Update, held: object): RowChange {
  const read = ROW_CHANGE.safeParse({
    type: 'change',
    table: change.table,
    operation: 'UPDATE',
    record: mergedColumns(held, change.set, change.cleared),
    oldRecord: held,
  });
  if (read.success) return read.data;
  const reason = read.error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join('.')} ${issue.message}`)
    .join('; ');
  throw new UnreadableChangeError(change.table, `the merged row is not valid: ${reason}`);
}

function keyMoved(change: Update): boolean {
  const keys: readonly string[] = LIVE_ROW_KEYS[change.table];
  return keys.some((column) => Object.hasOwn(change.set, column));
}

function applyUpdate(state: StoreState, change: Update, resolved: LiveChange[]): StoreState {
  const held = heldRowOf(state, change);
  if (held === null) {
    tally.bump(`unheld.${change.table}`);
    return state;
  }
  const update = { ...resolvedUpdate(change, held), seq: change.seq };
  resolved.push(update);
  if (!keyMoved(change)) return applyChange(state, update);
  const removed = applyChange(state, { ...update, operation: 'DELETE', record: null });
  return applyChange(removed, { ...update, operation: 'INSERT', oldRecord: null });
}

export function applyLiveChange(
  state: StoreState,
  change: LiveWireChange,
  resolved: LiveChange[],
): StoreState {
  if (change.operation === 'UPDATE') return applyUpdate(state, change, resolved);
  const row: LiveChange =
    change.operation === 'INSERT' ? { ...change, oldRecord: null } : { ...change, record: null };
  resolved.push(row);
  return applyChange(state, row);
}
