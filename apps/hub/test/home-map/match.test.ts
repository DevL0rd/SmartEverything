import type { HomeMapPolygonShape } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  matchRooms,
  polygonBoundariesWithin,
  polygonIntersectionArea,
  polygonIou,
} from '../../src/home-map/merge/match';

const rect = (x0: number, y0: number, x1: number, y1: number): HomeMapPolygonShape => ({
  outer: [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ],
  holes: [],
});

const diamond: HomeMapPolygonShape = {
  outer: [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 0, y: -1 },
  ],
  holes: [],
};

describe('the polygon overlap area', () => {
  it('is exact for overlapping, disjoint and contained rectangles', () => {
    expect(polygonIntersectionArea(rect(0, 0, 2, 2), rect(1, 1, 3, 3))).toBeCloseTo(1, 9);
    expect(polygonIntersectionArea(rect(0, 0, 2, 2), rect(3, 0, 5, 2))).toBe(0);
    expect(polygonIntersectionArea(rect(0, 0, 4, 4), rect(1, 1, 2, 3))).toBeCloseTo(2, 9);
  });

  it('is exact where edges cross at an angle', () => {
    expect(polygonIntersectionArea(diamond, rect(-1, -1, 1, 1))).toBeCloseTo(2, 9);
    expect(polygonIntersectionArea(diamond, rect(0, 0, 1, 1))).toBeCloseTo(0.5, 9);
  });

  it('honours holes and non-convex outlines', () => {
    const ring: HomeMapPolygonShape = {
      outer: rect(0, 0, 4, 4).outer,
      holes: [rect(1, 1, 3, 3).outer],
    };
    expect(polygonIntersectionArea(ring, rect(0, 0, 4, 4))).toBeCloseTo(12, 9);
    expect(polygonIntersectionArea(ring, rect(1, 1, 3, 3))).toBeCloseTo(0, 9);
    const ell: HomeMapPolygonShape = {
      outer: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 1 },
        { x: 1, y: 1 },
        { x: 1, y: 4 },
        { x: 0, y: 4 },
      ],
      holes: [],
    };
    expect(polygonIntersectionArea(ell, rect(0, 0, 4, 4))).toBeCloseTo(7, 9);
    expect(polygonIntersectionArea(ell, rect(2, 0.5, 3, 3))).toBeCloseTo(0.5, 9);
  });

  it('gives the intersection over union', () => {
    expect(polygonIou(rect(0, 0, 2, 2), rect(0, 0, 2, 2))).toBeCloseTo(1, 9);
    expect(polygonIou(rect(0, 0, 2, 2), rect(0, 0, 1, 2))).toBeCloseTo(0.5, 9);
    expect(polygonIou(rect(0, 0, 2, 2), rect(5, 5, 6, 6))).toBe(0);
  });
});

describe('the boundary distance test', () => {
  it('accepts equal and slightly shifted shapes and refuses beyond the distance', () => {
    expect(polygonBoundariesWithin(rect(0, 0, 4, 3), rect(0, 0, 4, 3), 0.01)).toBe(true);
    expect(polygonBoundariesWithin(rect(0, 0, 4, 3), rect(0.2, 0, 4.2, 3), 0.3)).toBe(true);
    expect(polygonBoundariesWithin(rect(0, 0, 4, 3), rect(0.2, 0, 4.2, 3), 0.1)).toBe(false);
  });

  it('sees a notch whose corners are all near the other outline', () => {
    const notched: HomeMapPolygonShape = {
      outer: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 1 },
        { x: 5.5, y: 1 },
        { x: 5.5, y: 0.5 },
        { x: 4.5, y: 0.5 },
        { x: 4.5, y: 1 },
        { x: 0, y: 1 },
      ],
      holes: [],
    };
    expect(polygonBoundariesWithin(notched, rect(0, 0, 10, 1), 0.3)).toBe(false);
    expect(polygonBoundariesWithin(notched, rect(0, 0, 10, 1), 0.5)).toBe(true);
  });

  it('sees a thin spike that barely changes the area', () => {
    const spiked: HomeMapPolygonShape = {
      outer: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 3 },
        { x: 2.1, y: 3 },
        { x: 2, y: 3.5 },
        { x: 1.9, y: 3 },
        { x: 0, y: 3 },
      ],
      holes: [],
    };
    expect(polygonBoundariesWithin(spiked, rect(0, 0, 4, 3), 0.3)).toBe(false);
    expect(polygonBoundariesWithin(spiked, rect(0, 0, 4, 3), 0.6)).toBe(true);
  });

  it('compares the holes as well', () => {
    const holed: HomeMapPolygonShape = {
      outer: rect(0, 0, 4, 4).outer,
      holes: [rect(1, 1, 2, 2).outer],
    };
    expect(polygonBoundariesWithin(holed, rect(0, 0, 4, 4), 0.3)).toBe(false);
    expect(polygonBoundariesWithin(holed, holed, 0.01)).toBe(true);
  });
});

describe('matching old rooms to new rooms', () => {
  const old = (
    id: string,
    ref: string,
    polygon: HomeMapPolygonShape,
  ): { id: string; ref: string; polygon: HomeMapPolygonShape } => ({ id, ref, polygon });

  it('binds equal ids first, whatever the shapes', () => {
    const result = matchRooms(
      [old('a', '1', rect(0, 0, 2, 2)), old('b', '2', rect(3, 0, 5, 2))],
      [
        { ref: '2', polygon: rect(10, 10, 12, 12) },
        { ref: '1', polygon: rect(0, 0, 2, 2) },
      ],
    );
    expect([...result.bound]).toEqual([
      ['a', '1'],
      ['b', '2'],
    ]);
    expect(result.unmatchedOld).toEqual([]);
    expect(result.unmatchedNew).toEqual([]);
  });

  it('rebinds renumbered rooms by overlap of at least 0.5 and keeps the best pairs', () => {
    const result = matchRooms(
      [old('a', '1', rect(0, 0, 4, 3)), old('b', '2', rect(4.1, 0, 8.1, 3))],
      [
        { ref: '12', polygon: rect(4.1, 0, 8.4, 3) },
        { ref: '11', polygon: rect(0, 0, 4, 3.2) },
      ],
    );
    expect([...result.bound]).toEqual([
      ['a', '11'],
      ['b', '12'],
    ]);
  });

  it('does not rebind below 0.5 and reports the leftovers', () => {
    const result = matchRooms(
      [old('a', '1', rect(0, 0, 4, 3))],
      [{ ref: '9', polygon: rect(3, 0, 7, 3) }],
    );
    expect(result.bound.size).toBe(0);
    expect(result.unmatchedOld).toEqual(['a']);
    expect(result.unmatchedNew).toEqual(['9']);
  });

  it('reports an old room covered by two or more new rooms as split and keeps the parts out of the new rooms', () => {
    const result = matchRooms(
      [old('a', '1', rect(0, 0, 4, 4))],
      [
        { ref: '21', polygon: rect(0, 0, 2, 2) },
        { ref: '22', polygon: rect(2, 0, 4, 2) },
        { ref: '23', polygon: rect(0, 2, 2, 4) },
        { ref: '24', polygon: rect(2, 2, 4, 4) },
        { ref: '30', polygon: rect(9, 9, 10, 10) },
      ],
    );
    expect(result.bound.size).toBe(0);
    expect([...result.splits]).toEqual([['a', ['21', '22', '23', '24']]]);
    expect(result.unmatchedOld).toEqual([]);
    expect(result.unmatchedNew).toEqual(['30']);
  });

  it('prefers the overlap rebind over the split when one new room carries the old room', () => {
    const result = matchRooms(
      [old('a', '1', rect(0, 0, 4, 3))],
      [
        { ref: '31', polygon: rect(0, 0, 2.8, 3) },
        { ref: '32', polygon: rect(2.8, 0, 4, 3) },
      ],
    );
    expect([...result.bound]).toEqual([['a', '31']]);
    expect(result.splits.size).toBe(0);
    expect(result.unmatchedNew).toEqual(['32']);
  });
});
