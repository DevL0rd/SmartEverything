import { describe, expect, it } from 'vitest';
import { SEMANTIC_SIZES } from '../design/tokens';
import { gridLayoutOf } from './grid-layout';

describe('Grid layout', () => {
  it('adds a column only when the cells and the rendered gaps fit', () => {
    const desktop = {
      minItemWidth: 240,
      maxColumns: 2,
      idiom: 'pointer',
      density: 'comfortable',
      gap: 'grid',
    } as const;
    expect(gridLayoutOf({ ...desktop, width: 495 }).columns).toBe(1);
    expect(gridLayoutOf({ ...desktop, width: 496 })).toEqual({
      columns: 2,
      cellWidth: 240,
    });
    expect(gridLayoutOf({ ...desktop, width: 488, gap: 'tight' })).toEqual({
      columns: 2,
      cellWidth: 240,
    });
  });

  it('fits fixed-width cells exactly across touch and pointer densities', () => {
    const width = 720;
    for (const idiom of ['touch', 'pointer'] as const) {
      for (const density of ['compact', 'comfortable'] as const) {
        const { gridGap } = SEMANTIC_SIZES[idiom][density];
        const { cellWidth, columns } = gridLayoutOf({
          width,
          minItemWidth: 200,
          maxColumns: 3,
          gap: 'grid',
          idiom,
          density,
        });
        expect(columns).toBe(3);
        expect(columns * cellWidth + (columns - 1) * gridGap).toBeCloseTo(width);
      }
    }
  });
});
