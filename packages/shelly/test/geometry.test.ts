import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  SHELLY_CELL_METRES,
  shellyCellKey,
  shellyCellsOf,
  shellyGridToView,
  shellyPointInArea,
  shellySensorOrigin,
  shellyTrackToGrid,
  shellyTrackToView,
  shellyViewInCells,
  type ShellyArea,
} from '../src';

const segment = fc.tuple(
  fc.integer({ min: -2, max: 18 }),
  fc.integer({ min: 0, max: 22 }),
  fc.integer({ min: -2, max: 18 }),
  fc.integer({ min: 0, max: 22 }),
);
const area = fc.array(segment, { maxLength: 4 });
const metres = (min: number, max: number): fc.Arbitrary<number> =>
  fc.integer({ min: min * 32, max: max * 32 }).map((steps) => steps / 32);
const track = fc.record({ x: metres(-9, 9), y: metres(-1, 11) });
const origin = fc.constantFrom(0, 8, 16);

describe('sensor origin', () => {
  it('places the sensor at the left edge, centre or right edge of the grid', () => {
    expect(['left', 'center', 'right'].map(shellySensorOrigin)).toEqual([0, 8, 16]);
  });

  it('treats an unknown or missing position as centred', () => {
    expect([
      shellySensorOrigin(undefined),
      shellySensorOrigin(null),
      shellySensorOrigin('up'),
    ]).toEqual([8, 8, 8]);
  });
});

describe('track and grid transform', () => {
  it('turns metres into half-metre grid cells', () => {
    expect(shellyTrackToGrid({ x: 1.5, y: 3 })).toEqual({ x: 3, y: 6 });
  });

  it('mirrors a grid point around the origin of each mounting position', () => {
    expect(shellyGridToView({ x: 4, y: 6 }, 0)).toEqual({ x: -2, y: 3 });
    expect(shellyGridToView({ x: 4, y: 6 }, 8)).toEqual({ x: 2, y: 3 });
    expect(shellyGridToView({ x: 4, y: 6 }, 16)).toEqual({ x: 6, y: 3 });
  });

  it('puts a track at the sensor when it stands on the sensor axis for every position', () => {
    fc.assert(
      fc.property(origin, fc.double({ min: 0, max: 10, noNaN: true }), (position, y) => {
        const view = shellyTrackToView({ x: 0, y }, position);
        expect(view.x).toBe(position * SHELLY_CELL_METRES);
        expect(view.y).toBe(y);
      }),
    );
  });

  it('moves a track by the same amount as the grid cell it stands in', () => {
    fc.assert(
      fc.property(track, origin, (point, position) => {
        expect(shellyTrackToView(point, position)).toEqual(
          shellyGridToView(shellyTrackToGrid(point), position),
        );
      }),
    );
  });
});

describe('zone cells', () => {
  it('fills the cells between the mirrored edges of a segment', () => {
    expect([...shellyCellsOf([[2, 4, 4, 6]], 8)].sort()).toEqual(['4,4', '4,5', '5,4', '5,5']);
  });

  it('keys cells by column and row', () => {
    expect(shellyCellKey(-3, 7)).toBe('-3,7');
  });

  it('accepts segments written from either corner', () => {
    expect(shellyCellsOf([[4, 6, 2, 4]], 8)).toEqual(shellyCellsOf([[2, 4, 4, 6]], 8));
  });
});

describe('point in area', () => {
  const zone: ShellyArea = [[2, 4, 4, 8]];

  it('is inside for a track in the middle of the zone', () => {
    expect(shellyPointInArea({ x: 1.25, y: 2.5 }, zone)).toBe(true);
  });

  it('is outside beside, before and after the zone', () => {
    expect(shellyPointInArea({ x: 2.5, y: 2.5 }, zone)).toBe(false);
    expect(shellyPointInArea({ x: 1.25, y: 1.5 }, zone)).toBe(false);
    expect(shellyPointInArea({ x: 1.25, y: 4 }, zone)).toBe(false);
    expect(shellyPointInArea({ x: 0.5, y: 2.5 }, zone)).toBe(false);
  });

  it('is outside an empty area', () => {
    expect(shellyPointInArea({ x: 1, y: 1 }, [])).toBe(false);
  });

  it('equals the drawn map for every mounting position', () => {
    fc.assert(
      fc.property(track, area, origin, (point, shape, position) => {
        const drawn = shellyViewInCells(
          shellyCellsOf(shape, position),
          shellyTrackToView(point, position),
        );
        expect(shellyPointInArea(point, shape)).toBe(drawn);
      }),
      { numRuns: 500 },
    );
  });

  it('does not depend on the mounting position', () => {
    fc.assert(
      fc.property(track, area, origin, origin, (point, shape, first, second) => {
        const inFirst = shellyViewInCells(
          shellyCellsOf(shape, first),
          shellyTrackToView(point, first),
        );
        const inSecond = shellyViewInCells(
          shellyCellsOf(shape, second),
          shellyTrackToView(point, second),
        );
        expect(inFirst).toBe(inSecond);
      }),
    );
  });
});
