import {
  HOME_MAP_NOTICE_WRITE,
  HOME_MAP_POINT,
  HOME_MAP_OBJECT_WRITE,
  HOME_MAP_PLACEMENT_WRITE,
  type HomeMap,
  type HomeMapNotice,
  type HomeMapRoom,
  type HomeMapSource,
  type HomeMapVec,
  vacuumSceneToSourceGeometry,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  FRAME_REALIGNED_TEXT,
  FRAME_REFUSED_TEXT,
  alignFrameCheck,
  alignedNoticeOps,
  framePairs,
  type AlignPair,
  fitRigidTransform,
  polygonCentroid,
  twoPointAlign,
} from '../../src/home-map/merge/align';
import { rectifyPoint } from '../../src/home-map/merge/rectify';
import {
  NOW,
  den,
  edit,
  emptyMap,
  floorOf,
  hall,
  importScene,
  jitter,
  planFor,
  withRooms,
} from './import-fixtures';
import { rectRing, rotateScene, rotatePoint, syntheticScene } from './scene-fixtures';

const HELD_DOCK = z.object({ at: HOME_MAP_POINT });

const first = (): HomeMap => importScene(emptyMap(), syntheticScene).map;

const sourceOf = (map: HomeMap): HomeMapSource => {
  const source = map.sources[0];
  if (!source) throw new Error('no source');
  return source;
};

const roomNamed = (map: HomeMap, name: string): HomeMapRoom => {
  const found = floorOf(map).rooms.find((room) => room.name === name);
  if (!found) throw new Error(`no room ${name}`);
  return found;
};

const withUserWork = (map: HomeMap): HomeMap => {
  const chair = HOME_MAP_OBJECT_WRITE.parse({
    id: 'chair',
    modelId: 'cat.seating.chair',
    finish: null,
    params: {},
    at: { x: 2, y: 2 },
    rotation: 30,
    elevation: 0,
    label: 'Reading chair',
    locked: false,
    origin: { kind: 'hand' },
  });
  const lamp = HOME_MAP_PLACEMENT_WRITE.parse({
    deviceId: '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
    floorId: 'floor-0',
    at: { x: 3, y: 1.5 },
    rotation: 0,
    height: 1.9,
    tilt: 0,
    mount: 'ceiling',
    auto: false,
    camera: null,
  });
  return edit(map, [
    { op: 'add', kind: 'object', floorId: 'floor-0', element: chair },
    { op: 'add', kind: 'placement', floorId: 'floor-0', element: lamp },
    {
      op: 'update',
      kind: 'room',
      floorId: 'floor-0',
      id: roomNamed(map, 'Den').id,
      patch: { name: 'Cinema', polygon: { outer: rectRing(4.6, 0.5, 8.6, 3.5), holes: [] } },
    },
  ]);
};

describe('the least squares fit', () => {
  const pairsOf = (deg: number, dx: number, dy: number, mirrored: boolean): AlignPair[] => {
    const robots: HomeMapVec[] = [
      { x: 1, y: 1 },
      { x: 6, y: 2 },
      { x: 3, y: 5 },
    ];
    return robots.map((robot) => {
      const flipped = mirrored ? { x: -robot.x, y: robot.y } : robot;
      return { robot, house: rotatePoint(flipped, deg, dx, dy) };
    });
  };

  it('recovers a known rotation and shift with no residual', () => {
    const pairs = pairsOf(33, 4, -2, false);
    const fit = fitRigidTransform(pairs, false);
    expect(fit?.transform.rotationDeg).toBeCloseTo(33, 6);
    expect(fit?.transform.tx).toBeCloseTo(4, 6);
    expect(fit?.transform.ty).toBeCloseTo(-2, 6);
    expect(fit?.rmsM).toBeCloseTo(0, 9);
  });

  it('keeps the mirror of the source', () => {
    const pairs = pairsOf(-70, 1, 1, true);
    const fit = fitRigidTransform(pairs, true);
    expect(fit?.transform.mirrored).toBe(true);
    expect(fit?.transform.rotationDeg).toBeCloseTo(-70, 6);
    expect(fit?.rmsM).toBeCloseTo(0, 9);
  });

  it('reports the residual of points that do not fit one rigid move', () => {
    const fit = fitRigidTransform(
      [
        { robot: { x: 0, y: 0 }, house: { x: 0, y: 0 } },
        { robot: { x: 4, y: 0 }, house: { x: 4.4, y: 0 } },
      ],
      false,
    );
    expect(fit?.rmsM).toBeCloseTo(0.2, 6);
  });

  it('refuses to fit fewer than two points or points on one spot', () => {
    const one = { robot: { x: 1, y: 1 }, house: { x: 2, y: 2 } };
    expect(fitRigidTransform([one], false)).toBeNull();
    expect(fitRigidTransform([one, one], false)).toBeNull();
  });

  it('finds the centroid of a polygon with a hole', () => {
    const centre = polygonCentroid({
      outer: rectRing(0, 0, 4, 2),
      holes: [rectRing(0, 0, 1, 2)],
    });
    expect(centre?.x).toBeCloseTo(2.5, 9);
    expect(centre?.y).toBeCloseTo(1, 9);
  });
});

describe('the two point align', () => {
  it('turns and shifts the robot frame so two picked points land on the house points', () => {
    const fit = twoPointAlign(
      [
        { robot: { x: 1, y: 1 }, house: { x: 5, y: 5 } },
        { robot: { x: 3, y: 1 }, house: { x: 5, y: 7 } },
      ],
      false,
    );
    expect(fit?.transform.rotationDeg).toBeCloseTo(90, 6);
    expect(fit?.rmsM).toBeCloseTo(0, 9);
    const at = rectifyPoint(fit?.transform ?? { rotationDeg: 0, tx: 0, ty: 0, mirrored: false }, {
      x: 3,
      y: 1,
    });
    expect([at.x, at.y].map((v) => Math.round(v * 1e6) / 1e6)).toEqual([5, 7]);
  });

  it('cannot align two picks on the same robot spot', () => {
    const pick = { robot: { x: 2, y: 2 }, house: { x: 5, y: 5 } };
    expect(twoPointAlign([pick, { ...pick, house: { x: 6, y: 6 } }], false)).toBeNull();
  });
});

describe('the frame check inside the import pipeline', () => {
  it('keeps the frame and writes nothing for a jittered, unmoved scene', () => {
    expect(planFor(first(), jitter(syntheticScene), alignFrameCheck)).toEqual({ kind: 'noop' });
  });

  it('keeps the frame when one room only grows', () => {
    const grown = withRooms(hall(), den(rectRing(4.1, 0, 9.1, 3)));
    const plan = planFor(first(), grown, alignFrameCheck);
    expect(plan.kind).toBe('merge');
    expect(sourceOf(importScene(first(), grown, alignFrameCheck).map).transform).toEqual(
      sourceOf(first()).transform,
    );
  });

  it('does not treat a moved dock alone as a moved frame', () => {
    const base = first();
    const moved = { ...syntheticScene, dock: { x: 3.5, y: 2.5, yaw: 0 } };
    expect(planFor(base, moved, alignFrameCheck)).toEqual({ kind: 'noop' });
  });
});

describe('rule 8: the robot re-mapped and the frame moved', () => {
  const remapped = rotateScene(syntheticScene, 25, 3, -2);

  it('realigns by the fit, keeps the user objects and placements and notes it', () => {
    const base = withUserWork(first());
    const { plan, map } = importScene(base, remapped, alignFrameCheck);
    expect(plan.kind).toBe('merge');
    const [before, after] = [floorOf(base), floorOf(map)];
    expect(after.objects).toEqual(before.objects);
    expect(after.placements).toEqual(before.placements);
    expect(after.annotations).toEqual(before.annotations);
    expect(roomNamed(map, 'Cinema').polygon).toEqual(roomNamed(base, 'Cinema').polygon);
    expect(sourceOf(map).transform.rotationDeg).toBeCloseTo(-25, 6);
    expect(map.notices).toHaveLength(1);
    expect(map.notices[0]).toMatchObject({
      kind: 'source_moved',
      elementId: 'src-1',
      detail: FRAME_REALIGNED_TEXT,
    });
    expect(map.revision).toBe(base.revision + 1);
  });

  it('leaves the rooms the user did not change where they were', () => {
    const base = first();
    const { map } = importScene(base, remapped, alignFrameCheck);
    const [was, now] = [
      roomNamed(base, 'Hall').polygon.outer,
      roomNamed(map, 'Hall').polygon.outer,
    ];
    now.forEach((point, index) => {
      expect(point.x).toBeCloseTo(was[index]?.x ?? NaN, 2);
      expect(point.y).toBeCloseTo(was[index]?.y ?? NaN, 2);
    });
  });

  it('uses the dock as a third match point when the source holds it', () => {
    const base = first();
    const dockless = importScene(emptyMap(), { ...syntheticScene, dock: null }).map;
    expect(framePairs(sourceOf(dockless), vacuumSceneToSourceGeometry(remapped))).toHaveLength(2);
    expect(framePairs(sourceOf(base), vacuumSceneToSourceGeometry(remapped))).toHaveLength(3);
    const { map } = importScene(base, remapped, alignFrameCheck);
    expect(sourceOf(map).transform.rotationDeg).toBeCloseTo(-25, 6);
    expect(map.notices).toHaveLength(1);
  });

  it('moves the held dock through the new transform on a realign', () => {
    const { map } = importScene(first(), remapped, alignFrameCheck);
    const source = sourceOf(map);
    const dock = remapped.dock;
    if (!dock) throw new Error('fixture dock');
    const expected = rectifyPoint(source.transform, { x: dock.x, y: dock.y });
    const held = source.base['dock'];
    const { at } = HELD_DOCK.parse(held);
    expect(at.x).toBeCloseTo(expected.x, 6);
    expect(at.y).toBeCloseTo(expected.y, 6);
  });

  it('takes a new map identity as a moved frame and realigns it', () => {
    const named = {
      op: 'update',
      kind: 'source',
      id: 'src-1',
      patch: { frame: { ...sourceOf(first()).frame, uid: 'map-a' } },
    } as const;
    const base = edit(first(), [named]);
    const sameSpot = {
      ...syntheticScene,
      rooms: syntheticScene.rooms.map((room) => ({ ...room })),
    };
    const plan = planFor(base, sameSpot, (input) =>
      alignFrameCheck({
        ...input,
        geometry: { ...input.geometry, frame: { ...input.geometry.frame, uid: 'map-b' } },
      }),
    );
    expect(plan.kind).toBe('merge');
    if (plan.kind !== 'merge') return;
    expect(plan.ops.some((op) => op.op === 'add' && op.kind === 'notice')).toBe(true);
  });
});

describe('rule 8: a residual over 15 cm stops the import', () => {
  const rearranged = rotateScene(withRooms(hall(), den(rectRing(10.1, 0, 14.1, 3))), 25, 3, -2);

  it('writes only the notice and moves nothing under the user work', () => {
    const base = withUserWork(first());
    const { plan, map } = importScene(base, rearranged, alignFrameCheck);
    expect(plan.kind).toBe('refused');
    expect(map.revision).toBe(base.revision + 1);
    expect(floorOf(map)).toEqual(floorOf(base));
    expect(sourceOf(map)).toEqual(sourceOf(base));
    expect(map.notices[0]).toMatchObject({ kind: 'source_moved', detail: FRAME_REFUSED_TEXT });
  });

  it('writes nothing more when the notice is already there', () => {
    const { map } = importScene(first(), rearranged, alignFrameCheck);
    expect(planFor(map, rearranged, alignFrameCheck)).toEqual({ kind: 'noop' });
  });

  it('refuses a new map identity with too few matches to fit', () => {
    const single = { ...withRooms(hall()), dock: null };
    const base = edit(importScene(emptyMap(), single).map, [
      {
        op: 'update',
        kind: 'source',
        id: 'src-1',
        patch: { frame: { uid: 'map-a', name: null, boundsSignature: '0,0,4,3' } },
      },
    ]);
    const plan = planFor(base, single, (input) =>
      alignFrameCheck({
        ...input,
        geometry: { ...input.geometry, frame: { ...input.geometry.frame, uid: 'map-b' } },
      }),
    );
    expect(plan.kind).toBe('refused');
  });
});

describe('after the user aligned by two points', () => {
  it('removes the moved notices of that source and no others', () => {
    const notice = (
      id: string,
      kind: 'source_moved' | 'source_changed',
      elementId: string,
    ): HomeMapNotice =>
      HOME_MAP_NOTICE_WRITE.parse({ id, kind, elementId, detail: 'x', createdAt: NOW });
    const ops = alignedNoticeOps(
      [
        notice('a', 'source_moved', 'src-1'),
        notice('b', 'source_moved', 'src-2'),
        notice('c', 'source_changed', 'src-1'),
      ],
      'src-1',
    );
    expect(ops).toEqual([{ op: 'remove', kind: 'notice', id: 'a' }]);
  });
});
