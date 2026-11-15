import type { RowChange } from './live';
import { LIVE_ROW_KEYS } from './live-frames';
import type { LiveTable } from './live-rows';

type Columns = Readonly<Record<string, unknown>>;

interface FrameHead {
  readonly type: 'change';
  readonly table: LiveTable;
}

export type LiveFrameOut = FrameHead &
  (
    | { readonly operation: 'INSERT'; readonly record: Columns }
    | {
        readonly operation: 'UPDATE';
        readonly key: Columns;
        readonly set: Columns;
        readonly previous: Columns;
        readonly cleared?: readonly string[];
      }
    | { readonly operation: 'DELETE'; readonly key: Columns; readonly oldRecord: Columns }
  );

export class LiveFrameError extends Error {
  override readonly name = 'LiveFrameError';

  constructor(
    readonly table: string,
    readonly reason: string,
  ) {
    super(`A live ${table} change cannot be framed: ${reason}.`);
  }
}

function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null) {
    return false;
  }
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const leftKeys = Object.keys(left);
  return (
    leftKeys.length === Object.keys(right).length &&
    leftKeys.every(
      (key) =>
        Object.hasOwn(right, key) && sameValue(Reflect.get(left, key), Reflect.get(right, key)),
    )
  );
}

function keyOf(table: LiveTable, row: Columns): Columns {
  const keys: readonly string[] = LIVE_ROW_KEYS[table];
  const key: Record<string, unknown> = {};
  for (const column of keys) {
    if (!Object.hasOwn(row, column) || row[column] === undefined) {
      throw new LiveFrameError(table, `the row has no key column ${column}`);
    }
    key[column] = row[column];
  }
  return key;
}

interface Diff {
  readonly set: Columns;
  readonly previous: Columns;
  readonly cleared: readonly string[];
}

function diffOf(before: Columns, after: Columns): Diff {
  const set: Record<string, unknown> = {};
  const previous: Record<string, unknown> = {};
  const cleared: string[] = [];
  for (const [column, value] of Object.entries(after)) {
    const old = before[column];
    if (sameValue(old, value)) continue;
    if (value === undefined) cleared.push(column);
    else set[column] = value;
    if (old !== undefined) previous[column] = old;
  }
  for (const [column, old] of Object.entries(before)) {
    if (old === undefined || Object.hasOwn(after, column)) continue;
    cleared.push(column);
    previous[column] = old;
  }
  return { set, previous, cleared };
}

function updateFrame(table: LiveTable, before: Columns, after: Columns): LiveFrameOut {
  const { set, previous, cleared } = diffOf(before, after);
  const head = {
    type: 'change',
    table,
    operation: 'UPDATE',
    key: keyOf(table, before),
    set,
    previous,
  } as const;
  return cleared.length === 0 ? head : { ...head, cleared };
}

export function liveFrameOf(change: RowChange): LiveFrameOut {
  const { table, record, oldRecord } = change;
  if (change.operation === 'DELETE') {
    if (oldRecord === null) throw new LiveFrameError(table, 'a DELETE carries no removed row');
    return { type: 'change', table, operation: 'DELETE', key: keyOf(table, oldRecord), oldRecord };
  }
  if (record === null) throw new LiveFrameError(table, `an ${change.operation} carries no row`);
  if (change.operation === 'INSERT' || oldRecord === null) {
    return { type: 'change', table, operation: 'INSERT', record };
  }
  return updateFrame(table, oldRecord, record);
}

export function mergedColumns(
  held: object,
  set: Columns,
  cleared: readonly string[] | undefined,
): Columns {
  const merged = { ...held, ...set };
  if (cleared === undefined) return merged;
  const gone = new Set(cleared);
  return Object.fromEntries(Object.entries(merged).filter(([column]) => !gone.has(column)));
}
