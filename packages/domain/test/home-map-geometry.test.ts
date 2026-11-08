import { describe, expect, it } from 'vitest';
import {
  HOME_MAP_NOOP_TOLERANCE,
  homeMapNearestWall,
  homeMapOpeningEnds,
  homeMapOpeningOffsetAt,
  homeMapPointInPolygon,
  homeMapPolygonArea,
  homeMapRingArea,
  homeMapRoomAt,
  homeMapSceneWithinTolerance,
  homeMapWallLength,
  homeMapWallsFromRings,
  type HomeMapPolygonShape,
  type HomeMapRingShape,
  type HomeMapToleranceScene,
} from '../src/home-map-geometry';

const rect = (x0: number, y0: number, x1: number, y1: number): HomeMapRingShape => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

const poly = (
  ring: HomeMapRingShape,
  holes: readonly HomeMapRingShape[] = [],
): HomeMapPolygonShape => ({
  outer: ring,
  holes,
});

const OPTIONS = { maxGap: 0.3, interior: 0.1, exterior: 0.2 };

const length = (s: { from: { x: number; y: number }; to: { x: number; y: number } }): number =>
  Math.hypot(s.to.x - s.from.x, s.to.y - s.from.y);

describe('area', () => {
  it('is the same for either winding and subtracts holes', () => {
    const ring = rect(0, 0, 4, 3);
    expect(homeMapRingArea(ring)).toBeCloseTo(12);
    expect(homeMapRingArea([...ring].reverse())).toBeCloseTo(12);
    expect(homeMapPolygonArea(poly(ring, [rect(1, 1, 2, 2)]))).toBeCloseTo(11);
  });

  it('matches width times height for a spread of rectangles', () => {
    for (const [w, h] of [
      [0.5, 0.5],
      [1, 7],
      [3.3, 2.2],
      [10, 0.1],
      [6.4, 6.4],
    ] as const) {
      expect(homeMapRingArea(rect(-1, 2, -1 + w, 2 + h))).toBeCloseTo(w * h);
    }
  });
});

describe('point in polygon', () => {
  const l = poly([
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 1 },
    { x: 1, y: 1 },
    { x: 1, y: 4 },
    { x: 0, y: 4 },
  ]);

  it('handles a concave ring', () => {
    expect(homeMapPointInPolygon(l, { x: 0.5, y: 3 })).toBe(true);
    expect(homeMapPointInPolygon(l, { x: 3, y: 0.5 })).toBe(true);
    expect(homeMapPointInPolygon(l, { x: 3, y: 3 })).toBe(false);
  });

  it('counts the boundary as inside and a hole interior as outside', () => {
    const holed = poly(rect(0, 0, 4, 4), [rect(1, 1, 3, 3)]);
    expect(homeMapPointInPolygon(holed, { x: 0, y: 2 })).toBe(true);
    expect(homeMapPointInPolygon(holed, { x: 2, y: 2 })).toBe(false);
    expect(homeMapPointInPolygon(holed, { x: 1, y: 2 })).toBe(true);
    expect(homeMapPointInPolygon(holed, { x: 0.5, y: 0.5 })).toBe(true);
  });
});

describe('room at a point', () => {
  const rooms = [
    { id: 'big', polygon: poly(rect(0, 0, 10, 10)) },
    { id: 'nook', polygon: poly(rect(2, 2, 4, 4)) },
  ];

  it('picks the smallest containing room and null outside', () => {
    expect(homeMapRoomAt(rooms, { x: 3, y: 3 })?.id).toBe('nook');
    expect(homeMapRoomAt(rooms, { x: 8, y: 8 })?.id).toBe('big');
    expect(homeMapRoomAt(rooms, { x: 11, y: 1 })).toBeNull();
  });
});

describe('walls from rings', () => {
  it('joins two rooms across a halo gap into one shared wall on the mid line', () => {
    const walls = homeMapWallsFromRings(
      [poly(rect(0, 0, 4, 3)), poly(rect(4.1, 0, 8, 3))],
      OPTIONS,
    );
    const shared = walls.filter((wall) => !wall.exterior);
    expect(shared).toHaveLength(1);
    expect(shared[0]?.thickness).toBe(0.1);
    expect(shared[0]?.from.x).toBeCloseTo(4.05);
    expect(shared[0]?.to.x).toBeCloseTo(4.05);
    expect(length(shared[0] ?? { from: { x: 0, y: 0 }, to: { x: 0, y: 0 } })).toBeCloseTo(3);
    const outer = walls.filter((wall) => wall.exterior);
    expect(outer).toHaveLength(6);
    expect(outer.every((wall) => wall.thickness === 0.2)).toBe(true);
    expect(outer.reduce((sum, wall) => sum + length(wall), 0)).toBeCloseTo(
      4 + 4 + 3 + 3.9 + 3.9 + 3,
    );
  });

  it('splits an edge into a shared part and an exterior part', () => {
    const walls = homeMapWallsFromRings([poly(rect(0, 0, 4, 6)), poly(rect(4, 0, 8, 3))], OPTIONS);
    const shared = walls.filter((wall) => !wall.exterior);
    expect(shared).toHaveLength(1);
    expect(length(shared[0] ?? { from: { x: 0, y: 0 }, to: { x: 0, y: 0 } })).toBeCloseTo(3);
    const tall = walls.filter((wall) => wall.exterior && wall.from.x === 4 && wall.to.x === 4);
    expect(tall).toHaveLength(1);
    expect(Math.min(tall[0]?.from.y ?? 0, tall[0]?.to.y ?? 0)).toBeCloseTo(3);
    expect(Math.max(tall[0]?.from.y ?? 0, tall[0]?.to.y ?? 0)).toBeCloseTo(6);
  });

  it('keeps rooms farther apart than the gap as separate exterior walls', () => {
    const walls = homeMapWallsFromRings([poly(rect(0, 0, 4, 3)), poly(rect(5, 0, 8, 3))], OPTIONS);
    expect(walls.some((wall) => !wall.exterior)).toBe(false);
    expect(walls).toHaveLength(8);
  });

  it('gives a lone room four exterior walls', () => {
    const walls = homeMapWallsFromRings([poly(rect(0, 0, 4, 3))], OPTIONS);
    expect(walls).toHaveLength(4);
    expect(walls.every((wall) => wall.exterior)).toBe(true);
  });
});

describe('openings on a wall', () => {
  const wall = { from: { x: 0, y: 0 }, to: { x: 4, y: 0 } };

  it('centres the opening on the tapped point and clamps to the wall', () => {
    expect(homeMapOpeningOffsetAt(wall, { x: 2, y: 0.3 }, 0.9)).toBeCloseTo(1.55);
    expect(homeMapOpeningOffsetAt(wall, { x: 0.1, y: 0 }, 0.9)).toBe(0);
    expect(homeMapOpeningOffsetAt(wall, { x: 3.9, y: 0 }, 0.9)).toBeCloseTo(3.1);
    expect(homeMapOpeningOffsetAt(wall, { x: 2, y: 0 }, 4.5)).toBeNull();
  });

  it('gives the two ends of an opening and the nearest wall', () => {
    expect(homeMapOpeningEnds(wall, 1, 0.8)).toEqual({
      from: { x: 1, y: 0 },
      to: { x: 1.8, y: 0 },
    });
    const other = { from: { x: 0, y: 5 }, to: { x: 4, y: 5 } };
    const hit = homeMapNearestWall([other, wall], { x: 1, y: 1 });
    expect(hit?.wall).toBe(wall);
    expect(hit?.offset).toBeCloseTo(1);
    expect(hit?.distance).toBeCloseTo(1);
    expect(homeMapWallLength(wall)).toBe(4);
    expect(homeMapNearestWall([], { x: 0, y: 0 })).toBeNull();
  });
});

describe('no-op tolerance compare', () => {
  const scene = (shift: (value: number) => number = (v) => v): HomeMapToleranceScene => ({
    rooms: [
      { ref: 'a', polygon: poly(rect(0, 0, 4, 3).map((p) => ({ x: shift(p.x), y: shift(p.y) }))) },
      { ref: 'b', polygon: poly(rect(4, 0, 8, 3)) },
    ],
    walls: [{ ref: 'w1', from: { x: 4, y: 0 }, to: { x: 4, y: 3 }, thickness: 0.1, kind: 'solid' }],
    openings: [{ ref: 'o1', wallRef: 'w1', offset: 1, width: 0.9, kind: 'door' }],
    carpets: [rect(1, 1, 2, 2), rect(5, 1, 6, 2)],
  });

  it('is within tolerance for identical and 5 mm jittered scenes', () => {
    expect(homeMapSceneWithinTolerance(scene(), scene())).toBe(true);
    const jitter = (value: number): number => value + (value > 2 ? 0.005 : -0.005);
    expect(homeMapSceneWithinTolerance(scene(), scene(jitter))).toBe(true);
  });

  it('fails when a vertex moves more than 2 cm', () => {
    const moved = scene();
    const first = moved.rooms[0];
    const outer = first?.polygon.outer ?? [];
    const next: HomeMapToleranceScene = {
      ...moved,
      rooms: [
        { ref: 'a', polygon: poly([{ x: 0.03, y: 0 }, ...outer.slice(1)]) },
        ...moved.rooms.slice(1),
      ],
    };
    expect(homeMapSceneWithinTolerance(scene(), next)).toBe(false);
  });

  it('fails when the area changes by more than 1 percent although vertices are within 2 cm', () => {
    const small: HomeMapToleranceScene = {
      rooms: [{ ref: 'a', polygon: poly(rect(0, 0, 1, 1)) }],
      walls: [],
      openings: [],
    };
    const grown: HomeMapToleranceScene = {
      ...small,
      rooms: [{ ref: 'a', polygon: poly(rect(-0.012, -0.012, 1.012, 1.012)) }],
    };
    expect(homeMapSceneWithinTolerance(small, grown)).toBe(false);
    expect(homeMapSceneWithinTolerance(small, grown, { vertexM: 0.02, areaFraction: 0.1 })).toBe(
      true,
    );
  });

  it('accepts a ring that starts at another vertex or runs the other way', () => {
    const base = scene();
    const ring = rect(0, 0, 4, 3);
    const rotated = [...ring.slice(2), ...ring.slice(0, 2)];
    for (const outer of [rotated, [...ring].reverse()]) {
      const next: HomeMapToleranceScene = {
        ...base,
        rooms: [{ ref: 'a', polygon: poly(outer) }, ...base.rooms.slice(1)],
      };
      expect(homeMapSceneWithinTolerance(base, next)).toBe(true);
    }
  });

  it('fails on added, missing or changed walls, doors and carpets', () => {
    const base = scene();
    expect(homeMapSceneWithinTolerance(base, { ...base, walls: [] })).toBe(false);
    expect(
      homeMapSceneWithinTolerance(base, {
        ...base,
        walls: base.walls.map((wall) => ({ ...wall, kind: 'glass' })),
      }),
    ).toBe(false);
    expect(
      homeMapSceneWithinTolerance(base, {
        ...base,
        openings: base.openings.map((opening) => ({ ...opening, offset: 1.05 })),
      }),
    ).toBe(false);
    expect(homeMapSceneWithinTolerance(base, { ...base, carpets: [rect(1, 1, 2, 2)] })).toBe(false);
    expect(
      homeMapSceneWithinTolerance(base, {
        ...base,
        carpets: [rect(5, 1, 6, 2), rect(1, 1, 2, 2)],
      }),
    ).toBe(true);
    expect(
      homeMapSceneWithinTolerance(
        { ...base, rooms: [] },
        { ...base, rooms: [] },
        HOME_MAP_NOOP_TOLERANCE,
      ),
    ).toBe(true);
  });
});
