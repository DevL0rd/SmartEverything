import { describe, expect, it } from 'vitest';
import type { BoardWidget, WidgetSize } from '@smarteverything/domain';
import { boardColumnsOf, cellOf, frameOf } from './board-geometry';
import { boardHeightOf, pack } from './packer';

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

  it('fits more widgets across wide boards without stretching their saved footprints', () => {
    const sizes = widgets('XL', 'M', 'M', 'W', 'M');
    const columns = boardColumnsOf('expanded', 3440);
    const placed = pack('expanded', sizes, columns);
    expect(placed.map(({ widget, col, row, cols }) => [widget.key, col, row, cols])).toEqual([
      ['w0', 0, 0, 12],
      ['w1', 12, 0, 6],
      ['w2', 18, 0, 6],
      ['w3', 12, 2, 12],
      ['w4', 24, 0, 6],
    ]);
    expect(boardColumnsOf('compact', 412)).toBe(4);
    expect(boardColumnsOf('medium', 900)).toBe(8);
    expect(boardColumnsOf('expanded', 1440)).toBe(12);
    expect(boardColumnsOf('expanded', 5120)).toBe(42);
  });

  it('gives every widget of a tier the same height on every board', () => {
    const cell = cellOf(380, 4, 'touch', 'comfortable');
    const heights = pack('compact', widgets('M', 'W', 'XL', 'M')).map(
      (tile) => frameOf(cell, tile).height,
    );
    expect(heights).toEqual([172, 172, 356, 172]);
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
});

describe('boardHeightOf', () => {
  it('ends at the lowest frame without a trailing gap', () => {
    const cell = { width: 100, height: 50, gap: 10, pad: 8 };
    expect(boardHeightOf([], cell)).toBe(0);
    expect(boardHeightOf(pack('compact', widgets('M', 'M', 'XL')), cell)).toBe(470);
  });
});
