import { describe, expect, it } from 'vitest';
import type { InsertPoint } from '../../model/canvas/contract';
import {
  CLOSED,
  armedPointId,
  cancel,
  choose,
  highlightsAllPoints,
  insertPointText,
  openPalette,
  paletteOpen,
  placeAt,
} from './armed-insert';
import type { PaletteChoice } from './palette-categories';

const POINT: InsertPoint = {
  id: '00000000-0000-4000-8000-000000000001',
  scope: 'root',
  index: 1,
  placement: 'edge',
  edgeId: null,
  slotId: null,
  after: null,
  before: null,
  x: 0,
  y: 0,
};
const OTHER: InsertPoint = { ...POINT, id: '00000000-0000-4000-8000-000000000002' };
const CHOICE: PaletteChoice = { source: 'node', kindId: 'flow.if' };

describe('armed insert', () => {
  it('inserts at the armed point as soon as a node is chosen', () => {
    const opened = openPalette(POINT);
    expect(paletteOpen(opened.state)).toBe(true);
    expect(armedPointId(opened.state)).toBe(POINT.id);
    const chosen = choose(opened.state, CHOICE);
    expect(chosen.insertion).toEqual({ choice: CHOICE, point: POINT });
    expect(chosen.state).toEqual(CLOSED);
  });

  it('waits for a tapped insert point when nothing is armed', () => {
    const opened = openPalette(null);
    expect(insertPointText(opened.state)).toBeNull();
    const chosen = choose(opened.state, CHOICE);
    expect(chosen.insertion).toBeNull();
    expect(highlightsAllPoints(chosen.state)).toBe(true);
    expect(paletteOpen(chosen.state)).toBe(false);
    expect(insertPointText(chosen.state)).toBe('Tap a highlighted spot to place it.');
    const placed = placeAt(chosen.state, OTHER);
    expect(placed.insertion).toEqual({ choice: CHOICE, point: OTHER });
    expect(placed.state).toEqual(CLOSED);
  });

  it('cancels from any phase and ignores out-of-phase events', () => {
    const placing = choose(openPalette(null).state, CHOICE).state;
    expect(cancel(placing).state).toEqual(CLOSED);
    expect(cancel(CLOSED).state).toEqual(CLOSED);
    expect(choose(CLOSED, CHOICE)).toEqual({ state: CLOSED, insertion: null });
    expect(placeAt(openPalette(POINT).state, OTHER).insertion).toBeNull();
  });
});
