import { describe, expect, it } from 'vitest';
import { upsert, tableOf } from './table-ops';
import type { TableRule } from './table-rules';

interface Row {
  readonly id: string;
  readonly rank: number;
  readonly note: string;
}

const RULE: TableRule<Row> = {
  idOf: (row) => row.id,
  order: (left, right) => left.rank - right.rank,
  keep: Number.MAX_SAFE_INTEGER,
};

const BASE = tableOf(
  [
    { id: 'a', rank: 1, note: 'x' },
    { id: 'b', rank: 2, note: 'x' },
    { id: 'c', rank: 3, note: 'x' },
  ],
  RULE,
  1,
);

describe('upsert', () => {
  it('keeps the id list and untouched rows when the order is unchanged', () => {
    const next = upsert(BASE, { id: 'b', rank: 2, note: 'y' }, RULE);
    expect(next.ids).toBe(BASE.ids);
    expect(next.byId['a']).toBe(BASE.byId['a']);
    expect(next.rows.map((row) => row.note)).toEqual(['x', 'y', 'x']);
    expect(next.version).toBe(2);
  });

  it('moves a row whose order changed', () => {
    const next = upsert(BASE, { id: 'a', rank: 5, note: 'x' }, RULE);
    expect(next.ids).toEqual(['b', 'c', 'a']);
    expect(next.rows.map((row) => row.id)).toEqual(['b', 'c', 'a']);
  });

  it('inserts a new row in order', () => {
    const next = upsert(BASE, { id: 'd', rank: 2.5, note: 'x' }, RULE);
    expect(next.ids).toEqual(['a', 'b', 'd', 'c']);
  });
});
