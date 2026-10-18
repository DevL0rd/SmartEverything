import { describe, expect, it } from 'vitest';
import { placeSlots, rowsHeight, type Metrics, type Slot } from './lane-layout';

const metrics: Metrics = { gap: 12, line: 80 };

const half = (rows: number): Slot => ({ kind: 'half', aspect: null, rows });
const wide = (rows: number): Slot => ({ kind: 'wide', aspect: null, rows });

describe('rowsHeight', () => {
  it('spans the board rows and the gaps between them', () => {
    expect(rowsHeight(2, metrics)).toBe(172);
    expect(rowsHeight(4, metrics)).toBe(356);
  });
});

describe('placeSlots', () => {
  it('gives a lone tile and a shared tile the full footprint height, never a short strip', () => {
    const tile: Slot = { kind: 'tile', aspect: null, rows: 2 };
    const [lone] = placeSlots([tile], 358, metrics);
    const [pair] = placeSlots([tile, tile], 358, metrics);
    expect(lone?.[0]?.height).toBe(172);
    expect(pair?.map((placed) => placed.height)).toStrictEqual([172, 172]);
  });

  it('gives a tall widget the height of its own footprint', () => {
    const [row] = placeSlots([wide(4)], 358, metrics);
    expect(row?.[0]?.height).toBe(356);
  });

  it('keeps short and tall widgets in separate rows', () => {
    const rows = placeSlots([half(2), half(4)], 600, metrics);
    expect(rows.map((row) => row.map((placed) => placed.height))).toStrictEqual([[172], [356]]);
  });

  it('pairs equally tall halves on a wide lane', () => {
    const rows = placeSlots([half(2), half(2)], 600, metrics);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.map((placed) => placed.height)).toStrictEqual([172, 172]);
  });

  it('sizes an aspect widget from its width', () => {
    const [row] = placeSlots([{ kind: 'wide', aspect: 2, rows: 2 }], 400, metrics);
    expect(row?.[0]?.height).toBe(200);
  });
});
