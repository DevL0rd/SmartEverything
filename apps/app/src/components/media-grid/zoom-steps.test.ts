import { describe, expect, it } from 'vitest';
import { layoutGrid, rowHeight, TILE_GAP, type TileRow } from './justify';
import { fixtureTiles } from './fixtures';
import { groupDays } from './tiles';
import {
  pinchShift,
  rowIndexOfTile,
  shiftStep,
  stepAt,
  stepIndex,
  tileAtX,
  wheelTurn,
  WHEEL_PIXELS_PER_STEP,
} from './zoom-steps';

describe('the timeline zoom steps', () => {
  it('runs Years, Months, Days, Comfortable and stops at both ends', () => {
    expect([0, 1, 2, 3].map(stepAt)).toEqual(['years', 'months', 'days', 'comfortable']);
    expect(shiftStep('days', 1)).toBe('comfortable');
    expect(shiftStep('comfortable', 1)).toBe('comfortable');
    expect(shiftStep('years', -1)).toBe('years');
    expect(stepIndex('months')).toBe(1);
  });

  it('steps a pinch once the scaled row passes halfway (geometric) to the next row height', () => {
    const days = stepIndex('days');
    const toComfortable = Math.sqrt(
      rowHeight('comfortable', 'pointer') / rowHeight('days', 'pointer'),
    );
    const toMonths = Math.sqrt(rowHeight('months', 'pointer') / rowHeight('days', 'pointer'));
    expect(pinchShift(days, toComfortable)).toBe(1);
    expect(pinchShift(days, toComfortable - 0.01)).toBe(0);
    expect(pinchShift(days, toMonths)).toBe(-1);
    expect(pinchShift(days, 1)).toBe(0);
    expect(pinchShift(stepIndex('comfortable'), 10)).toBe(0);
    expect(pinchShift(stepIndex('years'), 0.1)).toBe(0);
  });

  it('turns one ctrl+wheel notch (100 px in Chromium) into one step, wheel up zooming in', () => {
    expect(WHEEL_PIXELS_PER_STEP).toBe(100);
    expect(wheelTurn(2, 0, -100)).toEqual({ shift: 1, pending: 0 });
    expect(wheelTurn(2, 0, 100)).toEqual({ shift: -1, pending: 0 });
  });

  it('adds small trackpad pinch deltas up until a step and drops them when the direction flips', () => {
    let turn = wheelTurn(1, 0, -30);
    expect(turn).toEqual({ shift: 0, pending: 30 });
    turn = wheelTurn(1, turn.pending, -40);
    expect(turn).toEqual({ shift: 0, pending: 70 });
    turn = wheelTurn(1, turn.pending, -40);
    expect(turn).toEqual({ shift: 1, pending: 10 });
    expect(wheelTurn(1, 70, 20)).toEqual({ shift: 0, pending: -20 });
  });

  it('keeps nothing pending against an end so the next turn back steps at once', () => {
    expect(wheelTurn(3, 0, -500)).toEqual({ shift: 0, pending: 0 });
    expect(wheelTurn(3, 0, -50)).toEqual({ shift: 0, pending: 0 });
    expect(wheelTurn(0, 0, 100)).toEqual({ shift: 0, pending: 0 });
  });

  it('finds the focal tile under the pinch and its row after the relayout', () => {
    const tiles = fixtureTiles(40, 40);
    const before = layoutGrid(groupDays(tiles), { width: 900, target: 168, gap: TILE_GAP });
    const row = before.find((each): each is TileRow => each.kind === 'tiles');
    if (row === undefined) throw new Error('the grid has a tile row');
    const [first, second] = row.tiles;
    if (first === undefined || second === undefined) throw new Error('the row has two tiles');
    expect(tileAtX(row, 0)).toBe(first.tile.id);
    expect(tileAtX(row, first.width + TILE_GAP + 1)).toBe(second.tile.id);
    expect(tileAtX(row, 10_000)).toBe(row.tiles.at(-1)?.tile.id);
    const after = layoutGrid(groupDays(tiles), { width: 900, target: 64, gap: TILE_GAP });
    const index = rowIndexOfTile(after, second.tile.id);
    const found = after[index];
    expect(found?.kind === 'tiles' && found.tiles.some((p) => p.tile.id === second.tile.id)).toBe(
      true,
    );
    expect(rowIndexOfTile(after, 'missing')).toBe(-1);
  });
});
