import { Children, isValidElement } from 'react';
import { describe, expect, it } from 'vitest';
import { frameOf, type Cell } from './board-geometry';
import { BoardRowLayers, rowLayersOf } from './board-row-layers';
import type { Placement } from './packer';

const CELL: Cell = { width: 80, height: 110, gap: 8, pad: 16 };

function tile(key: string, col: number, row: number, rows: number): Placement {
  return { widget: { key, type: 'device', size: 'M', options: {} }, col, row, cols: 1, rows };
}

function layerKeys(placements: readonly Placement[], cell: Cell): readonly (string | null)[] {
  const layers = BoardRowLayers({
    placements,
    cell,
    layer: () => null,
    render: () => null,
  });
  return Children.toArray(layers).map((layer) => (isValidElement(layer) ? layer.key : null));
}

describe('scroll-owned widget layers', () => {
  it('shares a renderer across a row and fits a tile that spans the next row', () => {
    const one = tile('one', 0, 0, 2);
    const two = tile('two', 1, 0, 1);
    const three = tile('three', 1, 1, 1);
    expect(rowLayersOf([one, two, three], CELL)).toEqual([
      { row: 0, top: 0, height: 228, placements: [one, two] },
      { row: 1, top: 118, height: 110, placements: [three] },
    ]);
    for (const layer of rowLayersOf([one, two, three], CELL)) {
      for (const placement of layer.placements) {
        const frame = frameOf(CELL, placement);
        expect(frame.top - layer.top).toBe(0);
        expect(frame.height).toBeLessThanOrEqual(layer.height);
      }
    }
  });

  it('keeps a resized row canvas and retires it when a repack replaces its widgets', () => {
    const fan = tile('fan', 0, 0, 1);
    const diffuser = tile('diffuser', 1, 0, 1);
    const light = tile('light', 0, 0, 1);
    const before = layerKeys([fan, diffuser], CELL);
    expect(before).toHaveLength(1);
    expect(layerKeys([fan, diffuser], { ...CELL, width: 120 })).toEqual(before);
    expect(layerKeys([light, diffuser], CELL)).not.toEqual(before);
    expect(layerKeys([diffuser, fan], CELL)).not.toEqual(before);
  });
});
