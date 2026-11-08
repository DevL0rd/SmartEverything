import { describe, expect, it } from 'vitest';
import {
  CLOSED,
  FREE_POINT,
  cancel,
  choose,
  insertPointText,
  openPalette,
  paletteOpen,
  filterPinOf,
  type InsertPoint,
} from './armed-insert';
import type { PaletteChoice } from './palette-categories';

const WIRE: InsertPoint = {
  pin: {
    kind: 'exec',
    nodeId: '00000000-0000-4000-8000-000000000001',
    nodeKey: 'check',
    port: 'next',
  },
  at: { x: 10, y: 20 },
  filtered: true,
};
const CHOICE: PaletteChoice = { source: 'node', kindId: 'flow.if' };

describe('armed insert', () => {
  it('inserts at the armed wire as soon as a node is chosen', () => {
    const opened = openPalette(WIRE, null);
    expect(paletteOpen(opened.state)).toBe(true);
    expect(filterPinOf(opened.state)).toBe(WIRE.pin);
    expect(insertPointText(opened.state)).toBe('Adding at the spot you picked.');
    const chosen = choose(opened.state, CHOICE);
    expect(chosen.insertion).toEqual({ choice: CHOICE, point: WIRE });
    expect(chosen.state).toEqual(CLOSED);
  });

  it('keeps the whole palette when the wire is only a suggestion', () => {
    const suggested = { ...WIRE, filtered: false };
    const opened = openPalette(suggested, null);
    expect(filterPinOf(opened.state)).toBeNull();
    expect(insertPointText(opened.state)).toBeNull();
    expect(choose(opened.state, CHOICE).insertion).toEqual({ choice: CHOICE, point: suggested });
  });

  it('adds a free step when no wire is armed', () => {
    const opened = openPalette(FREE_POINT, null);
    expect(filterPinOf(opened.state)).toBeNull();
    expect(insertPointText(opened.state)).toBeNull();
    expect(choose(opened.state, CHOICE).insertion).toEqual({ choice: CHOICE, point: FREE_POINT });
  });

  it('ignores a choice while closed and closes on cancel', () => {
    expect(choose(CLOSED, CHOICE)).toEqual({ state: CLOSED, insertion: null });
    const opened = openPalette(WIRE, null);
    expect(cancel(opened.state).state).toEqual(CLOSED);
    expect(cancel(CLOSED).state).toBe(CLOSED);
    expect(paletteOpen(CLOSED)).toBe(false);
    expect(filterPinOf(CLOSED)).toBeNull();
  });
});
