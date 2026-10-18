import { sameJson } from './same-json';
import { makeTable, type Table } from './state';
import type { TableRule } from './table-rules';

export function tableOf<R>(rows: readonly R[], rule: TableRule<R>, version: number): Table<R> {
  const sorted = [...rows].sort(rule.order).slice(0, rule.keep);
  const byId: Record<string, R> = {};
  for (const row of sorted) {
    byId[rule.idOf(row)] = row;
  }
  return makeTable(byId, sorted.map(rule.idOf), version);
}

class MissingTableRowError extends Error {
  override readonly name = 'MissingTableRowError';

  constructor(readonly id: string | undefined) {
    super(`The table lists the row ${String(id)} but holds no row under that id.`);
  }
}

function insertionIndex<R>(
  ids: readonly string[],
  byId: Readonly<Record<string, R>>,
  row: R,
  rule: TableRule<R>,
): number {
  let low = 0;
  let high = ids.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const id = ids[middle];
    const existing = id === undefined ? undefined : byId[id];
    if (existing === undefined) throw new MissingTableRowError(id);
    if (rule.order(existing, row) > 0) high = middle;
    else low = middle + 1;
  }
  return low;
}

function byIdWith<R>(
  ids: readonly string[],
  previous: Readonly<Record<string, R>>,
  id: string,
  row: R,
): Record<string, R> {
  const byId: Record<string, R> = {};
  for (const other of ids) {
    const existing = other === id ? row : previous[other];
    if (existing !== undefined) byId[other] = existing;
  }
  return byId;
}

function staysInPlace<R>(table: Table<R>, at: number, row: R, rule: TableRule<R>): boolean {
  const before = table.rows[at - 1];
  const after = table.rows[at + 1];
  return (
    table.rows.length === table.ids.length &&
    (before === undefined || rule.order(before, row) <= 0) &&
    (after === undefined || rule.order(row, after) < 0)
  );
}

export function upsert<R>(table: Table<R>, row: R, rule: TableRule<R>): Table<R> {
  const id = rule.idOf(row);
  const known = table.byId[id];
  if (known !== undefined && sameJson(known, row)) return table;
  const current = known === undefined ? -1 : table.ids.indexOf(id);
  if (current >= 0 && staysInPlace(table, current, row, rule))
    return {
      byId: { ...table.byId, [id]: row },
      ids: table.ids,
      rows: table.rows.map((existing, index) => (index === current ? row : existing)),
      version: table.version + 1,
    };
  const others = known === undefined ? table.ids : table.ids.filter((other) => other !== id);
  const at = insertionIndex(others, table.byId, row, rule);
  const placed =
    known !== undefined && table.ids[at] === id
      ? table.ids
      : [...others.slice(0, at), id, ...others.slice(at)];
  const ids = placed.length <= rule.keep ? placed : placed.slice(0, rule.keep);
  return makeTable(byIdWith(ids, table.byId, id, row), ids, table.version + 1);
}

export function remove<R>(table: Table<R>, id: string): Table<R> {
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
