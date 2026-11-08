import { describe, expect, it } from 'vitest';
import {
  MapBlobError,
  ROUTE_ACTION,
  decodeMapRoute,
  findAction,
  mergeRouteDelta,
  parseRouteDelta,
  routeDeltaInput,
  type MapPaths,
  type RoutePoint,
} from '../src';
import { pv11glMap } from './vacuum-support';

function wire(
  points: readonly Record<string, unknown>[],
): readonly { piid: number; value: string }[] {
  return [{ piid: 24, value: JSON.stringify({ points }) }];
}

function point(poseId: number, extra: Partial<RoutePoint> = {}): RoutePoint {
  return { poseId, x: poseId * 10, y: -poseId, yaw: 100, penDown: true, mode: 'sweep', ...extra };
}

describe('the map path of the scrubbed current map', () => {
  it('decodes 41 points whose pose ids run 0 to 40, the map pose id being the next cursor', () => {
    const route = decodeMapRoute(pv11glMap('current').paths);
    expect(route?.cursor).toBe(41);
    expect(route?.points).toHaveLength(41);
    expect(route?.points.map((item) => item.poseId)).toEqual(
      Array.from({ length: 41 }, (_, index) => index),
    );
    expect(route?.points[0]).toMatchObject({ penDown: false, mode: 'sweep' });
    expect(route?.points.filter((item) => item.penDown)).toHaveLength(26);
    expect(route?.points.every((item) => item.yaw !== null)).toBe(true);
  });

  it('has no route in a map without paths', () => {
    expect(decodeMapRoute(pv11glMap('saved').paths)).toBeNull();
  });

  it('numbers the points backwards from the cursor, the last point being cursor minus one', () => {
    const paths: MapPaths = {
      pose_id: 130,
      points: [
        { x: 1, y: 2, type: 0 },
        { x: 3, y: 4, type: 1, yaw: -5, sweep_mop_mode: 3 },
      ],
    };
    expect(decodeMapRoute(paths)).toEqual({
      cursor: 130,
      points: [
        { poseId: 128, x: 1, y: 2, yaw: null, penDown: false, mode: 'sweep' },
        { poseId: 129, x: 3, y: 4, yaw: -5, penDown: true, mode: 'both' },
      ],
    });
  });

  it('reads the mop mode and refuses an unknown pen type or sweep mode by name', () => {
    const mop = decodeMapRoute({
      pose_id: 1,
      points: [{ x: 0, y: 0, type: 1, sweep_mop_mode: 2 }],
    });
    expect(mop?.points[0]?.mode).toBe('mop');
    const bad = (type: number, mode: number): string => {
      try {
        decodeMapRoute({ pose_id: 1, points: [{ x: 0, y: 0, type, sweep_mop_mode: mode }] });
        return 'ok';
      } catch (error) {
        return error instanceof MapBlobError ? `${error.step}: ${error.received}` : 'other';
      }
    };
    expect(bad(2, 1)).toBe('route point: type 2');
    expect(bad(1, 0)).toBe('route point: mode 0');
    expect(bad(1, 4)).toBe('route point: mode 4');
  });
});

describe('A2.47 delta (confirmed live: in {pose_id:N}, out {points}, pose_id >= N, ascending)', () => {
  it('matches the catalog action: one input and one output, both piid 24', () => {
    const action = findAction(ROUTE_ACTION.siid, ROUTE_ACTION.aiid);
    expect(action?.name).toBe('get-vacuum-route');
    expect(action?.inputs).toEqual([ROUTE_ACTION.piid]);
    expect(action?.outputs).toEqual([ROUTE_ACTION.piid]);
  });

  it('asks with the piid-tagged JSON text of the last pose id', () => {
    expect(routeDeltaInput(41)).toEqual([{ piid: 24, value: '{"pose_id":41}' }]);
  });

  it('parses the points of the answer in pose id order', () => {
    const delta = parseRouteDelta(
      wire([
        { pose_id: 43, x: 5, y: 6, type: 1, yaw: 7, sweep_mop_mode: 2 },
        { pose_id: 42, x: 1, y: 2, type: 0, yaw: 3 },
      ]),
    );
    expect(delta).toEqual([
      { poseId: 42, x: 1, y: 2, yaw: 3, penDown: false, mode: 'sweep' },
      { poseId: 43, x: 5, y: 6, yaw: 7, penDown: true, mode: 'mop' },
    ]);
  });

  it('reads the NULL answer beyond the last pose id as nothing new', () => {
    expect(parseRouteDelta([{ piid: 24, value: 'NULL' }])).toEqual([]);
  });

  it('reads an answer without points or without the output as nothing new', () => {
    expect(parseRouteDelta(wire([]))).toEqual([]);
    expect(parseRouteDelta([])).toEqual([]);
    expect(parseRouteDelta([{ piid: 3, value: 'x' }])).toEqual([]);
  });

  it('names the failing step for an output that is not text, not JSON or not the delta shape', () => {
    const fail = (outputs: readonly { piid: number; value: unknown }[]): string => {
      try {
        parseRouteDelta(outputs);
        return 'ok';
      } catch (error) {
        return error instanceof MapBlobError ? `${error.step}: ${error.received}` : 'other';
      }
    };
    expect(fail([{ piid: 24, value: 7 }])).toBe('route delta output: number');
    expect(fail([{ piid: 24, value: 'private text' }])).toBe('route delta: text that is not JSON');
    expect(fail([{ piid: 24, value: '{"points":[{"pose_id":1,"x":0}]}' }])).toBe(
      'route delta: invalid fields points.0.y, points.0.type',
    );
    expect(fail(wire([{ pose_id: 1, x: 0, y: 0, type: 5 }]))).toBe('route point: type 5');
  });

  it('appends the points from the cursor on and moves the cursor past the last one', () => {
    const route = { cursor: 2, points: [point(0), point(1)] };
    const merged = mergeRouteDelta(route, [point(1), point(2), point(3)]);
    expect(merged.gap).toBe(false);
    expect(merged.appended).toBe(2);
    expect(merged.route.cursor).toBe(4);
    expect(merged.route.points.map((item) => item.poseId)).toEqual([0, 1, 2, 3]);
  });

  it('keeps the point whose pose id equals the cursor, the first one a live answer returns', () => {
    const route = { cursor: 2, points: [point(0), point(1)] };
    const merged = mergeRouteDelta(route, [point(2)]);
    expect(merged.appended).toBe(1);
    expect(merged.route.cursor).toBe(3);
  });

  it('keeps the route when the answer holds nothing new', () => {
    const route = { cursor: 2, points: [point(0), point(1)] };
    expect(mergeRouteDelta(route, [point(1)])).toEqual({ route, appended: 0, gap: false });
    expect(mergeRouteDelta(route, [])).toEqual({ route, appended: 0, gap: false });
  });

  it('reports a gap instead of joining points that are not consecutive', () => {
    const route = { cursor: 2, points: [point(0), point(1)] };
    expect(mergeRouteDelta(route, [point(5), point(6)])).toEqual({ route, appended: 0, gap: true });
  });

  it('continues the path of the scrubbed current map from its cursor', () => {
    const route = decodeMapRoute(pv11glMap('current').paths);
    expect(route).not.toBeNull();
    if (route === null) return;
    const delta = parseRouteDelta(
      wire([
        { pose_id: 41, x: 1, y: 1, type: 1, yaw: 0, sweep_mop_mode: 2 },
        { pose_id: 42, x: 2, y: 2, type: 1, yaw: 0, sweep_mop_mode: 2 },
      ]),
    );
    const merged = mergeRouteDelta(route, delta);
    expect(merged.appended).toBe(2);
    expect(merged.route.cursor).toBe(43);
    expect(merged.route.points).toHaveLength(43);
    expect(merged.route.points[41]?.poseId).toBe(41);
    expect(routeDeltaInput(merged.route.cursor)).toEqual([{ piid: 24, value: '{"pose_id":43}' }]);
  });
});
