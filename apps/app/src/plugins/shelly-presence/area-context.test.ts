import { describe, expect, it } from 'vitest';
import type { ShellyArea } from '@smarteverything/shelly';
import { commitStroke, strokeRejected, toolStroke } from './area-context';

const START = { x: 2, y: 3 };
const END = { x: 4, y: 5 };

describe('painter strokes', () => {
  it('turns a paint drag into a stroke that is committed into the zone area', () => {
    const strokes = toolStroke('paint', START, END, undefined);
    expect(strokes).toEqual([[2, 6, 5, 3]]);
    expect(commitStroke([], 'paint', strokes)).toEqual([[2, 6, 5, 3]]);
  });

  it('draws nothing with the select tool so no preview appears and vanishes', () => {
    expect(toolStroke('select', START, END, undefined)).toEqual([]);
  });

  it('keeps painted cells inside the allowed room', () => {
    const room: ShellyArea = [[0, 4, 3, 0]];
    expect(toolStroke('paint', START, END, room)).toEqual([[2, 4, 3, 3]]);
  });

  it('erases an existing cell from the area', () => {
    const strokes = toolStroke('erase', { x: 0, y: 0 }, { x: 0, y: 0 }, undefined);
    expect(commitStroke([[0, 2, 2, 0]], 'erase', strokes)).toEqual([
      [1, 2, 2, 0],
      [0, 2, 1, 1],
    ]);
  });

  it('flags a paint stroke wholly outside the room as rejected instead of dropping it silently', () => {
    const room: ShellyArea = [[0, 4, 3, 0]];
    const strokes = toolStroke('paint', { x: 10, y: 10 }, { x: 12, y: 12 }, room);
    expect(strokes).toEqual([]);
    expect(strokeRejected('paint', strokes)).toBe(true);
  });

  it('does not flag accepted strokes or the select tool', () => {
    expect(strokeRejected('paint', toolStroke('paint', START, END, undefined))).toBe(false);
    expect(strokeRejected('select', toolStroke('select', START, END, undefined))).toBe(false);
    expect(strokeRejected('erase', toolStroke('erase', START, END, [[0, 4, 3, 0]]))).toBe(false);
  });
});
