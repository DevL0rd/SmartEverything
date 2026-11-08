import { describe, expect, it } from 'vitest';
import { GRAPH_HEAD_PX, GRAPH_MIN_PX, graphFit } from './cell-graph-model';
import { cellMedallionSize, medallionGeometry } from './medallion-model';

describe('graphFit', () => {
  it('draws the head and the tier height when the room holds both', () => {
    expect(graphFit(40, 40 + GRAPH_HEAD_PX)).toEqual({ head: true, height: 40 });
    expect(graphFit(40, 400)).toEqual({ head: true, height: 40 });
  });

  it('thins the graph to the room left under the head', () => {
    expect(graphFit(96, GRAPH_HEAD_PX + 30)).toEqual({ head: true, height: 30 });
  });

  it('keeps the graph without its head when only the graph fits', () => {
    expect(graphFit(40, GRAPH_HEAD_PX)).toEqual({ head: false, height: GRAPH_HEAD_PX });
    expect(graphFit(40, GRAPH_MIN_PX)).toEqual({ head: false, height: GRAPH_MIN_PX });
  });

  it('leaves the graph out only when the room cannot hold its empty caption', () => {
    expect(graphFit(40, GRAPH_MIN_PX - 1)).toEqual({ head: false, height: null });
    expect(graphFit(40, 0)).toEqual({ head: false, height: null });
  });
});

describe('cellMedallionSize', () => {
  it('keeps the medallion inside the tier art square on every idiom', () => {
    const art = { m: 96, w: 96, l: 128, xl: 128 } as const;
    for (const cls of ['m', 'w', 'l', 'xl'] as const) {
      for (const pointer of [false, true]) {
        expect(medallionGeometry(cellMedallionSize(cls), pointer).px).toBeLessThanOrEqual(art[cls]);
      }
    }
  });

  it('uses the larger hero medallion only on the tall tiers', () => {
    expect(cellMedallionSize('m')).toBe('cell');
    expect(cellMedallionSize('w')).toBe('cell');
    expect(cellMedallionSize('l')).toBe('hero');
    expect(cellMedallionSize('xl')).toBe('hero');
  });
});
