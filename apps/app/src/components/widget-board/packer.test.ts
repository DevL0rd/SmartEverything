import { describe, expect, it } from 'vitest';
import type { BoardWidget, WidgetSize } from '@smarteverything/domain';
import { fittedCell, pack, rowsOf } from './packer';

function widgets(...sizes: WidgetSize[]): BoardWidget[] {
  return sizes.map((size, index) => ({ key: `w${String(index)}`, type: 'w', size }));
}

function spots(board: 'compact' | 'medium' | 'expanded', ...sizes: WidgetSize[]): number[][] {
  return pack(board, widgets(...sizes)).map((p) => [p.col, p.row, p.cols, p.rows]);
}

describe('pack', () => {
  it('puts every widget on a row of its own on the phone board', () => {
    expect(spots('compact', 'M', 'W', 'XL')).toEqual([
      [0, 0, 4, 2],
      [0, 2, 4, 2],
      [0, 4, 4, 4],
    ]);
  });

  it('lays medium widgets side by side on wider boards and wraps to the next row', () => {
    expect(spots('medium', 'M', 'M', 'M')).toEqual([
      [0, 0, 4, 2],
      [4, 0, 4, 2],
      [0, 2, 4, 2],
    ]);
    expect(spots('expanded', 'M', 'M', 'M')).toEqual([
      [0, 0, 6, 2],
      [6, 0, 6, 2],
      [0, 2, 6, 2],
    ]);
  });

  it('fills the gap left beside a medium widget before starting a new row', () => {
    expect(spots('medium', 'M', 'W', 'M')).toEqual([
      [0, 0, 4, 2],
      [0, 2, 8, 2],
      [4, 0, 4, 2],
    ]);
  });

  it('uses the columns of each board class', () => {
    expect(spots('medium', 'W', 'M', 'M')).toEqual([
      [0, 0, 8, 2],
      [0, 2, 4, 2],
      [4, 2, 4, 2],
    ]);
    expect(spots('expanded', 'W', 'XL')).toEqual([
      [0, 0, 12, 2],
      [0, 2, 12, 4],
    ]);
  });

  it('keeps the order of the widgets and gives no overlapping cells', () => {
    const placed = pack('expanded', widgets('M', 'M', 'XL', 'W', 'M', 'W', 'M'));
    expect(placed.map((p) => p.widget.key)).toEqual(['w0', 'w1', 'w2', 'w3', 'w4', 'w5', 'w6']);
    const cells = new Set<string>();
    for (const p of placed) {
      for (let row = p.row; row < p.row + p.rows; row += 1) {
        for (let col = p.col; col < p.col + p.cols; col += 1) {
          const cell = `${String(row)}:${String(col)}`;
          expect(cells.has(cell)).toBe(false);
          cells.add(cell);
        }
      }
    }
  });

  it('gives a widget with a fixed aspect its height from the width it spans', () => {
    const sizing = {
      cell: { width: 100, height: 50, gap: 10, pad: 8 },
      aspectOf: (type: string): number | undefined => (type === 'camera' ? 2 : undefined),
    };
    const placed = pack(
      'compact',
      [
        { key: 'a', type: 'camera', size: 'M' },
        { key: 'b', type: 'plain', size: 'M' },
      ],
      sizing,
    );
    expect(placed[0]).toMatchObject({ cols: 4, rows: 4, height: 215 });
    expect(placed[1]).toMatchObject({ cols: 4, rows: 2, col: 0, row: 4 });
    expect(placed[1]?.height).toBeUndefined();
  });
});

describe('rowsOf', () => {
  it('is the number of rows the placements reach', () => {
    expect(rowsOf([])).toBe(0);
    expect(rowsOf(pack('compact', widgets('M', 'M', 'XL')))).toBe(8);
  });
});

describe('fittedCell', () => {
  const cell = { width: 100, height: 50, gap: 10, pad: 8 };

  it('leaves the cell alone when no widget has a fixed aspect', () => {
    const sizing = { cell, aspectOf: (): undefined => undefined };
    expect(fittedCell('compact', widgets('M'), sizing)).toBe(cell);
  });

  it('stretches the row height so the first fixed-aspect widget fills whole rows', () => {
    const sizing = { cell, aspectOf: (): number => 2 };
    const fitted = fittedCell('compact', widgets('M'), sizing);
    expect(fitted.height).toBeCloseTo(46.25);
    expect(4 * fitted.height + 3 * fitted.gap).toBeCloseTo(215);
  });
});
