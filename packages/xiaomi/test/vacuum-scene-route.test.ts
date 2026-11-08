import type { VacuumRoom, VacuumScene } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  TRAIL_GAP_MILLIMETRES,
  applyRoute,
  buildTrail,
  buildVacuumScene,
  currentRoomId,
  decodeMapRoute,
  roomAt,
  routePose,
  type Route,
  type RoutePoint,
} from '../src';
import { pv11glMap } from './vacuum-support';

function point(poseId: number, extra: Partial<RoutePoint> = {}): RoutePoint {
  return { poseId, x: poseId * 100, y: 0, yaw: 1000, penDown: true, mode: 'sweep', ...extra };
}

function routeOf(points: readonly RoutePoint[]): Route {
  return { cursor: points.length, points };
}

function square(x: number, y: number, size: number): VacuumRoom['rings'][number] {
  return [
    { x, y },
    { x: x + size, y },
    { x: x + size, y: y + size },
    { x, y: y + size },
  ];
}

function room(id: number, rings: VacuumRoom['rings']): VacuumRoom {
  return {
    id,
    name: `Room ${String(id)}`,
    colour: 1,
    floor: 0,
    hidden: false,
    areaM2: 1,
    label: { x: 0, y: 0 },
    rings,
    settings: null,
  };
}

describe('trail runs', () => {
  it('has no trail without a route and none for a single point', () => {
    expect(buildTrail(null)).toEqual([]);
    expect(buildTrail(routeOf([point(0, { penDown: false })]))).toEqual([]);
  });

  it('turns millimetres into metres and keeps one run for a connected sweep', () => {
    const runs = buildTrail(routeOf([point(0, { penDown: false }), point(1), point(2)]));
    expect(runs).toEqual([
      {
        mopping: false,
        points: [
          { x: 0, y: 0 },
          { x: 0.1, y: 0 },
          { x: 0.2, y: 0 },
        ],
      },
    ]);
  });

  it('starts a new run at every pen-up point', () => {
    const runs = buildTrail(
      routeOf([point(0), point(1), point(2, { penDown: false }), point(3), point(4)]),
    );
    expect(runs.map((run) => run.points.length)).toEqual([2, 3]);
    expect(runs[1]?.points[0]).toEqual({ x: 0.2, y: 0 });
  });

  it('splits on a jump larger than 500 mm but not on exactly 500 mm', () => {
    expect(TRAIL_GAP_MILLIMETRES).toBe(500);
    const edge = buildTrail(routeOf([point(0), point(1, { x: 500 }), point(2, { x: 1000 })]));
    expect(edge).toHaveLength(1);
    const jump = buildTrail(
      routeOf([point(0), point(1), point(2), point(3, { x: 900 }), point(4, { x: 1000 })]),
    );
    expect(jump.map((run) => run.points.length)).toEqual([3, 2]);
  });

  it('measures the gap in both axes', () => {
    const runs = buildTrail(
      routeOf([
        point(0),
        point(1, { x: 0, y: 400 }),
        point(2, { x: 300, y: 700 }),
        point(3, { x: 900, y: 1300 }),
        point(4, { x: 1000, y: 1300 }),
      ]),
    );
    expect(runs.map((run) => run.points.length)).toEqual([3, 2]);
  });

  it('marks mop and both runs as mopping and starts a new run where the mode changes', () => {
    const runs = buildTrail(
      routeOf([
        point(0),
        point(1),
        point(2, { mode: 'mop' }),
        point(3, { mode: 'both' }),
        point(4, { mode: 'sweep' }),
        point(5, { mode: 'sweep' }),
      ]),
    );
    expect(runs.map((run) => run.mopping)).toEqual([false, true, false]);
    expect(runs[0]?.points.at(-1)).toEqual(runs[1]?.points[0]);
    expect(runs[1]?.points.at(-1)).toEqual(runs[2]?.points[0]);
    expect(runs.map((run) => run.points.length)).toEqual([2, 3, 3]);
  });

  it('rebuilding from the merged route gives the same trail as the whole route at once', () => {
    const whole = [point(0), point(1), point(2), point(3, { penDown: false }), point(4)];
    expect(buildTrail(routeOf(whole.slice(0, 3)))).toEqual(buildTrail(routeOf(whole)).slice(0, 1));
  });
});

describe('robot pose from the route', () => {
  it('uses the last point and converts yaw from milliradians', () => {
    const pose = routePose(routeOf([point(0), point(1, { x: 1500, y: -2500, yaw: -1570 })]), null);
    expect(pose).toEqual({ x: 1.5, y: -2.5, yaw: -1.57 });
  });

  it('keeps the known yaw when the last point carries none', () => {
    const known = { x: 9, y: 9, yaw: 0.5 };
    expect(routePose(routeOf([point(0, { yaw: null })]), known)).toEqual({ x: 0, y: 0, yaw: 0.5 });
  });

  it('keeps the known pose when there is no point', () => {
    const known = { x: 1, y: 2, yaw: 3 };
    expect(routePose(null, known)).toBe(known);
    expect(routePose(routeOf([]), known)).toBe(known);
    expect(routePose(null, null)).toBeNull();
  });
});

describe('current room', () => {
  const rooms = [
    room(3, [square(0, 0, 4)]),
    room(4, [square(4, 0, 4)]),
    room(5, [square(10, 0, 6), square(12, 2, 2)]),
  ];

  it('finds the room that holds the point', () => {
    expect(roomAt(rooms, { x: 1, y: 1 })).toBe(3);
    expect(roomAt(rooms, { x: 5, y: 3 })).toBe(4);
  });

  it('treats an inner ring as a hole', () => {
    expect(roomAt(rooms, { x: 13, y: 3 })).toBeNull();
    expect(roomAt(rooms, { x: 11, y: 1 })).toBe(5);
  });

  it('is null outside every room or without a point', () => {
    expect(roomAt(rooms, { x: 50, y: 50 })).toBeNull();
    expect(roomAt(rooms, null)).toBeNull();
  });

  it('reads the room of the scene robot', () => {
    expect(currentRoomId({ rooms, robot: { x: 6, y: 1, yaw: 0 } })).toBe(4);
    expect(currentRoomId({ rooms, robot: null })).toBeNull();
  });
});

describe('the synthetic current map', () => {
  const map = pv11glMap('current');
  const scene: VacuumScene = buildVacuumScene({
    map,
    index: 1,
    slot: 'current',
    fetchedAt: '2026-10-24T10:00:00.000Z',
  });
  const route = decodeMapRoute(map.paths);

  it('builds a trail from the map path whose runs all hold at least two points', () => {
    const trail = buildTrail(route);
    expect(trail.length).toBeGreaterThan(0);
    expect(trail.every((run) => run.points.length >= 2)).toBe(true);
    expect(trail.every((run) => !run.mopping)).toBe(true);
    const drawn = trail.reduce((sum, run) => sum + run.points.length, 0);
    expect(drawn).toBeLessThanOrEqual(route?.points.length ?? 0);
  });

  it('puts the robot at the last path point and finds its room', () => {
    const next = applyRoute(scene, route);
    const last = route?.points.at(-1);
    expect(next.robot?.x).toBeCloseTo((last?.x ?? 0) / 1000, 6);
    expect(next.robot?.y).toBeCloseTo((last?.y ?? 0) / 1000, 6);
    expect(next.trail).toEqual(buildTrail(route));
    expect(next.rooms).toBe(scene.rooms);
    expect(currentRoomId(next)).toBe(3);
  });

  it('leaves the scene untouched without a route', () => {
    expect(applyRoute(scene, null)).toBe(scene);
  });
});
