import { describe, expect, it } from 'vitest';
import * as domain from '../src/index';
import {
  homeMapHugWall,
  homeMapSnapPoint,
  homeMapSnapRotation,
  type HomeMapSnapSettings,
  type HomeMapSnapWall,
} from '../src/home-map-snap';

const SETTINGS: HomeMapSnapSettings = {
  radius: 0.15,
  gridM: 0.1,
  points: true,
  guides: true,
  anchor: null,
  angleStepDeg: 45,
};

const wall = (x0: number, y0: number, x1: number, y1: number): HomeMapSnapWall => ({
  from: { x: x0, y: y0 },
  to: { x: x1, y: y1 },
  thickness: 0.2,
});

describe('rotation', () => {
  it('snaps to 15 degree steps, stays free with no step and wraps', () => {
    expect(homeMapSnapRotation(52, 15)).toBe(45);
    expect(homeMapSnapRotation(53, 15)).toBe(60);
    expect(homeMapSnapRotation(-10, 15)).toBe(345);
    expect(homeMapSnapRotation(371.5, null)).toBeCloseTo(11.5);
  });
});

describe('point snapping', () => {
  const walls = [wall(0, 0, 4, 0)];

  it('snaps to the grid, or stays free with the grid off', () => {
    const grid = homeMapSnapPoint({ x: 7.34, y: 6.26 }, [], SETTINGS);
    expect(grid.kind).toBe('grid');
    expect(grid.point.x).toBeCloseTo(7.3);
    expect(grid.point.y).toBeCloseTo(6.3);
    const free = homeMapSnapPoint({ x: 7.34, y: 6.26 }, [], { ...SETTINGS, gridM: null });
    expect(free).toEqual({ point: { x: 7.34, y: 6.26 }, kind: 'free', guides: [] });
    const fine = homeMapSnapPoint({ x: 0.272, y: 0 }, [], { ...SETTINGS, gridM: 0.05 });
    expect(fine.point.x).toBeCloseTo(0.25);
  });

  it('snaps to wall endpoints and midpoints, endpoints first', () => {
    expect(homeMapSnapPoint({ x: 3.95, y: 0.04 }, walls, SETTINGS)).toMatchObject({
      point: { x: 4, y: 0 },
      kind: 'endpoint',
    });
    expect(homeMapSnapPoint({ x: 2.03, y: -0.05 }, walls, SETTINGS)).toMatchObject({
      point: { x: 2, y: 0 },
      kind: 'midpoint',
    });
    expect(
      homeMapSnapPoint({ x: 3.95, y: 0.04 }, walls, { ...SETTINGS, points: false, guides: false })
        .kind,
    ).toBe('grid');
    expect(homeMapSnapPoint({ x: 9.02, y: 9.01 }, walls, SETTINGS, [{ x: 9, y: 9 }]).point).toEqual(
      { x: 9, y: 9 },
    );
  });

  it('constrains to right angles and 45 degrees from the anchor and releases', () => {
    const anchor = { x: 0, y: 0 };
    const flat = homeMapSnapPoint({ x: 2, y: 0.3 }, [], { ...SETTINGS, anchor });
    expect(flat.kind).toBe('angle');
    expect(flat.point.y).toBeCloseTo(0);
    expect(flat.point.x).toBeCloseTo(2);
    expect(flat.guides[0]).toMatchObject({ kind: 'angle', from: anchor });
    const diagonal = homeMapSnapPoint({ x: 3.04, y: 2.96 }, [], { ...SETTINGS, anchor });
    expect(diagonal.point.x).toBeCloseTo(3);
    expect(diagonal.point.y).toBeCloseTo(3);
    const released = homeMapSnapPoint({ x: 2, y: 0.3 }, [], {
      ...SETTINGS,
      anchor,
      angleStepDeg: null,
    });
    expect(released.kind).toBe('grid');
    expect(released.point.y).toBeCloseTo(0.3);
  });

  it('snaps onto the extension of a nearby wall and to the crossing of two', () => {
    const one = homeMapSnapPoint({ x: 7.03, y: 0.07 }, walls, SETTINGS);
    expect(one.kind).toBe('guide');
    expect(one.point.y).toBeCloseTo(0);
    expect(one.point.x).toBeCloseTo(7);
    expect(one.guides).toEqual([{ kind: 'extension', from: { x: 4, y: 0 }, to: one.point }]);
    const two = homeMapSnapPoint({ x: 6.05, y: 0.04 }, [...walls, wall(6, 2, 6, 5)], SETTINGS);
    expect(two.kind).toBe('intersection');
    expect(two.point.x).toBeCloseTo(6);
    expect(two.point.y).toBeCloseTo(0);
    expect(two.guides).toHaveLength(2);
    expect(homeMapSnapPoint({ x: 7.03, y: 0.07 }, walls, { ...SETTINGS, guides: false }).kind).toBe(
      'grid',
    );
  });

  it('meets an extension guide on the angle ray', () => {
    const result = homeMapSnapPoint({ x: 5.02, y: 2.03 }, [wall(5, 0, 5, 1)], {
      ...SETTINGS,
      anchor: { x: 0, y: 2 },
    });
    expect(result.kind).toBe('intersection');
    expect(result.point.x).toBeCloseTo(5);
    expect(result.point.y).toBeCloseTo(2);
    expect(result.guides.map((guide) => guide.kind)).toEqual(['angle', 'extension']);
  });

  it('is deterministic for the same input', () => {
    const a = homeMapSnapPoint({ x: 1.234, y: 5.678 }, [wall(0, 0, 4, 0)], SETTINGS);
    const b = homeMapSnapPoint({ x: 1.234, y: 5.678 }, [wall(0, 0, 4, 0)], SETTINGS);
    expect(a).toEqual(b);
  });
});

describe('wall hug', () => {
  const walls = [wall(0, 0, 4, 0)];

  it('puts the back of an object against the wall face and faces away', () => {
    const above = homeMapHugWall(walls, { at: { x: 2, y: 0.5 }, depth: 0.6, radius: 0.1 });
    expect(above?.at.x).toBeCloseTo(2);
    expect(above?.at.y).toBeCloseTo(0.4);
    expect(above?.rotation).toBeCloseTo(90);
    const below = homeMapHugWall(walls, { at: { x: 2, y: -0.45 }, depth: 0.6, radius: 0.1 });
    expect(below?.at.y).toBeCloseTo(-0.4);
    expect(below?.rotation).toBeCloseTo(270);
    expect(below?.wall).toBe(walls[0]);
  });

  it('mounts a flat device on the wall face and ignores far walls and wall ends', () => {
    const mounted = homeMapHugWall(walls, { at: { x: 1, y: 0.15 }, depth: 0, radius: 0.1 });
    expect(mounted?.at.y).toBeCloseTo(0.1);
    expect(homeMapHugWall(walls, { at: { x: 2, y: 1.2 }, depth: 0.6, radius: 0.1 })).toBeNull();
    expect(homeMapHugWall(walls, { at: { x: 5, y: 0.4 }, depth: 0.6, radius: 0.1 })).toBeNull();
    expect(homeMapHugWall([], { at: { x: 0, y: 0 }, depth: 0, radius: 1 })).toBeNull();
  });
});

describe('package index', () => {
  it('exports the geometry and snapping functions', () => {
    expect(domain.homeMapSnapPoint).toBe(homeMapSnapPoint);
    expect(typeof domain.homeMapWallsFromRings).toBe('function');
  });
});
