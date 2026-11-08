import { describe, expect, it } from 'vitest';
import { TYPE_SCALE } from '../../design/tokens';
import {
  cellIconForm,
  domainOf,
  fitsLine,
  GRAPH_HEAD_PX,
  GRAPH_MIN_PX,
  graphFit,
  LINE_START,
  lineEndAfter,
  lineWidthAfter,
  listRowsThatFit,
} from './cell-graph-model';

describe('domainOf', () => {
  it('shares one ceiling between the lines so they compare', () => {
    expect(
      domainOf([
        [
          { t: 1, v: 2 },
          { t: 2, v: 9 },
        ],
        [{ t: 1, v: 4 }],
      ]),
    ).toEqual([0, 9]);
  });

  it('keeps a flat zero line drawable', () => {
    expect(domainOf([[{ t: 1, v: 0 }]])).toEqual([0, 1]);
  });
});

describe('listRowsThatFit', () => {
  const line = TYPE_SCALE.touch.caption[1];

  it('counts the rows that fit under the caption line', () => {
    expect(listRowsThatFit(line + 3 * (line + 2), 'touch')).toBe(3);
    expect(listRowsThatFit(line + 3 * (line + 2) - 1, 'touch')).toBe(2);
  });

  it('fits no row when only the caption has room', () => {
    expect(listRowsThatFit(line, 'touch')).toBe(0);
    expect(listRowsThatFit(0, 'touch')).toBe(0);
  });

  it('fits more rows on pointer, where the caption line is shorter', () => {
    const room = 120;
    expect(listRowsThatFit(room, 'pointer')).toBeGreaterThan(listRowsThatFit(room, 'touch'));
  });
});

describe('fitsLine', () => {
  it('shows an item until the line width is known', () => {
    expect(fitsLine(undefined, 200)).toBe(true);
    expect(fitsLine(400, null)).toBe(true);
  });

  it('shows items that end inside the line and hides those past it', () => {
    expect(fitsLine(200, 200)).toBe(true);
    expect(fitsLine(200.4, 200)).toBe(true);
    expect(fitsLine(201, 200)).toBe(false);
  });
});

describe('cellIconForm', () => {
  it('uses the icon form only at tier M', () => {
    expect(cellIconForm('m')).toBe(true);
    expect(cellIconForm('w')).toBe(false);
    expect(cellIconForm('l')).toBe(false);
    expect(cellIconForm('xl')).toBe(false);
  });
});

describe('graphFit', () => {
  it('draws the graph alone until the slot is measured', () => {
    expect(graphFit(40, null)).toEqual({ head: false, height: 40 });
  });

  it('adds the head once the measured room holds it above the graph', () => {
    expect(graphFit(40, 40 + GRAPH_HEAD_PX)).toEqual({ head: true, height: 40 });
    expect(graphFit(40, GRAPH_MIN_PX + GRAPH_HEAD_PX)).toEqual({
      head: true,
      height: GRAPH_MIN_PX,
    });
  });

  it('drops the head before the graph and the graph only when no line fits', () => {
    expect(graphFit(40, GRAPH_MIN_PX + GRAPH_HEAD_PX - 1)).toEqual({
      head: false,
      height: GRAPH_MIN_PX + GRAPH_HEAD_PX - 1,
    });
    expect(graphFit(40, GRAPH_MIN_PX - 1)).toEqual({ head: false, height: null });
  });
});

describe('line fit', () => {
  it('records the line width and each item end in one state', () => {
    const sized = lineWidthAfter(LINE_START, 200);
    const placed = lineEndAfter(sized, 'a', 120);
    expect(placed).toEqual({ width: 200, ends: new Map([['a', 120]]) });
    expect(fitsLine(placed.ends.get('a'), placed.width)).toBe(true);
    expect(fitsLine(lineEndAfter(placed, 'b', 240).ends.get('b'), placed.width)).toBe(false);
  });

  it('keeps the same state when a measure repeats, so nothing redraws', () => {
    const placed = lineEndAfter(lineWidthAfter(LINE_START, 200), 'a', 120);
    expect(lineWidthAfter(placed, 200)).toBe(placed);
    expect(lineEndAfter(placed, 'a', 120)).toBe(placed);
  });
});
