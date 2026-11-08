import {
  vacuumSceneToSourceGeometry,
  type HomeMapSourceGeometry,
  type HomeMapVec,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  cleanRing,
  dominantWallAngleDeg,
  estimateRectifyTransform,
  rectifyPoint,
  rectifyScene,
  rectifyYawDeg,
  snapRingToAxes,
} from '../../src/home-map/merge/rectify';
import { fixtureScene, must, rectRing, rotateScene, syntheticScene } from './scene-fixtures';

const geometryOf = (scene: typeof fixtureScene): HomeMapSourceGeometry =>
  vacuumSceneToSourceGeometry(scene);

const isAxisEdge = (a: HomeMapVec, b: HomeMapVec): boolean => a.x === b.x || a.y === b.y;

const length = (a: HomeMapVec, b: HomeMapVec): number => Math.hypot(b.x - a.x, b.y - a.y);

describe('dominant wall angle', () => {
  it('is zero for an axis aligned map', () => {
    expect(Math.abs(dominantWallAngleDeg(geometryOf(fixtureScene)))).toBeLessThan(0.1);
  });

  it.each([
    [17, 17],
    [-30, -30],
    [63, -27],
    [140, -40],
  ])('finds %f degrees as %f from the length weighted histogram', (turn, expected) => {
    const angle = dominantWallAngleDeg(geometryOf(rotateScene(fixtureScene, turn, 3, -2)));
    expect(angle).toBeCloseTo(expected, 0);
  });

  it('weights by length: a few long walls beat many short diagonals', () => {
    const scene = rotateScene(syntheticScene, 10);
    const diagonals = Array.from({ length: 6 }, (_, index) => ({
      from: { x: index, y: 0 },
      to: { x: index + 0.1, y: 0.1 },
      kind: 'interior',
      height: null,
    }));
    const angle = dominantWallAngleDeg(
      geometryOf({ ...scene, walls: [...scene.walls, ...diagonals] }),
    );
    expect(angle).toBeCloseTo(10, 0);
  });
});

describe('the transform of a first import', () => {
  it('rotates the dominant angle onto the axes and puts the minimum corner at 0.5, 0.5', () => {
    const geometry = geometryOf(rotateScene(fixtureScene, 17, 40, -25));
    const transform = estimateRectifyTransform(geometry);
    expect(transform.rotationDeg).toBeCloseTo(-17, 0);
    expect(transform.mirrored).toBe(false);
    const corners = geometry.rooms
      .flatMap((room) => room.ring)
      .map((p) => rectifyPoint(transform, p));
    expect(Math.min(...corners.map((p) => p.x))).toBeGreaterThanOrEqual(0.5 - 1e-6);
    expect(Math.min(...corners.map((p) => p.y))).toBeGreaterThanOrEqual(0.5 - 1e-6);
    const walls = geometry.walls
      .flatMap((wall) => [wall.from, wall.to])
      .map((p) => rectifyPoint(transform, p));
    expect(Math.min(...walls.map((p) => p.x))).toBeCloseTo(0.5, 6);
    expect(Math.min(...walls.map((p) => p.y))).toBeCloseTo(0.5, 6);
  });

  it('gives an empty map the identity turn', () => {
    const geometry = geometryOf({
      ...fixtureScene,
      rooms: [],
      walls: [],
      doors: [],
      carpets: [],
      dock: null,
    });
    expect(estimateRectifyTransform(geometry)).toEqual({
      rotationDeg: 0,
      tx: 0,
      ty: 0,
      mirrored: false,
    });
  });

  it('maps points and yaw with the mirror first, then the turn', () => {
    const transform = { rotationDeg: 90, tx: 1, ty: 2, mirrored: true };
    const point = rectifyPoint(transform, { x: 3, y: 4 });
    expect(point.x).toBeCloseTo(-3, 6);
    expect(point.y).toBeCloseTo(-3 + 2, 6);
    expect(
      rectifyYawDeg({ rotationDeg: 0, tx: 0, ty: 0, mirrored: false }, Math.PI / 2),
    ).toBeCloseTo(90, 9);
    expect(rectifyYawDeg({ rotationDeg: 30, tx: 5, ty: 5, mirrored: false }, 0)).toBeCloseTo(30, 9);
    expect(rectifyYawDeg({ rotationDeg: 0, tx: 0, ty: 0, mirrored: true }, 0)).toBeCloseTo(180, 9);
  });
});

describe('snapping and cleaning rings', () => {
  it('snaps edges within 8 degrees to the axes and leaves steeper ones', () => {
    const tilted = [
      { x: 0, y: 0 },
      { x: 4, y: 0.35 },
      { x: 4.02, y: 3 },
      { x: 0, y: 3.05 },
    ];
    const snapped = snapRingToAxes(tilted);
    expect(snapped.every((p, i) => isAxisEdge(p, snapped[(i + 1) % snapped.length] ?? p))).toBe(
      true,
    );
    const diagonal = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 1 },
      { x: 2, y: 2.2 },
      { x: 0, y: 1 },
    ];
    const kept = snapRingToAxes(diagonal);
    expect(kept[3]).toEqual({ x: 2, y: 2.2 });
    expect(kept[2]).toEqual({ x: 4, y: 1 });
  });

  it('does not snap an edge 20 degrees off', () => {
    const ring = [
      { x: 0, y: 0 },
      { x: 4, y: 1.45 },
      { x: 4, y: 3 },
      { x: 0, y: 3 },
    ];
    expect(snapRingToAxes(ring)[1]).toEqual({ x: 4, y: 1.45 });
  });

  it('merges a nearly straight run of edges to one line and removes the collinear points', () => {
    const ring = [
      { x: 0, y: 0 },
      { x: 2, y: 0.03 },
      { x: 4, y: 0.01 },
      { x: 4, y: 3 },
      { x: 0, y: 3 },
    ];
    const cleaned = cleanRing(snapRingToAxes(ring));
    expect(cleaned).toHaveLength(4);
    expect(cleaned.every((p, i) => isAxisEdge(p, cleaned[(i + 1) % cleaned.length] ?? p))).toBe(
      true,
    );
  });

  it('removes duplicate and collinear points without losing corners', () => {
    const ring = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 3 },
      { x: 4, y: 3 },
      { x: 0, y: 3 },
    ];
    expect(cleanRing(ring)).toEqual(rectRing(0, 0, 4, 3).map((p) => ({ x: p.x, y: p.y })));
  });
});

describe('the rectified fixture house', () => {
  const scene = rectifyScene(
    geometryOf(rotateScene(fixtureScene, 17, 40, -25)),
    estimateRectifyTransform(geometryOf(rotateScene(fixtureScene, 17, 40, -25))),
  );
  const uprightGeometry = geometryOf(fixtureScene);
  const upright = rectifyScene(uprightGeometry, estimateRectifyTransform(uprightGeometry));

  it('makes every room edge and wall axis aligned with no collinear leftovers', () => {
    expect(scene.rooms).toHaveLength(5);
    for (const room of scene.rooms) {
      const ring = room.polygon.outer;
      expect(ring.every((p, i) => isAxisEdge(p, ring[(i + 1) % ring.length] ?? p))).toBe(true);
      expect(cleanRing(ring)).toHaveLength(ring.length);
    }
    expect(scene.walls.every((wall) => isAxisEdge(wall.from, wall.to))).toBe(true);
  });

  it('gives the same house whatever the robot frame was turned to', () => {
    expect(scene.rooms.map((room) => room.ref)).toEqual(upright.rooms.map((room) => room.ref));
    expect(scene.walls).toHaveLength(upright.walls.length);
    expect(scene.openings).toHaveLength(upright.openings.length);
    expect(scene.skipped).toEqual(upright.skipped);
    scene.rooms.forEach((room, index) => {
      const other = upright.rooms[index];
      room.polygon.outer.forEach((p, i) => {
        expect(p.x).toBeCloseTo(other?.polygon.outer[i]?.x ?? NaN, 1);
        expect(p.y).toBeCloseTo(other?.polygon.outer[i]?.y ?? NaN, 1);
      });
    });
  });

  it('puts the dock where the robot had it and keeps its heading relative to the walls', () => {
    const dock = must(scene.dock);
    const reference = must(upright.dock);
    expect(reference.yawDeg).toBeCloseTo(-90, 1);
    expect(dock.yawDeg).toBeCloseTo(reference.yawDeg, 0);
    expect(dock.at.x).toBeCloseTo(reference.at.x, 1);
    expect(dock.at.y).toBeCloseTo(reference.at.y, 1);
  });

  it('turns every scene door that lies on a wall into an opening inside that wall', () => {
    expect(upright.openings.length + upright.skipped.filter((s) => s.kind === 'door').length).toBe(
      5,
    );
    expect(upright.openings.length).toBeGreaterThan(0);
    for (const opening of upright.openings) {
      const wall = upright.walls.find((candidate) => candidate.ref === opening.wallRef);
      expect(wall).toBeDefined();
      expect(opening.width).toBeGreaterThan(0);
      expect(opening.offset + opening.width).toBeLessThanOrEqual(
        length(wall?.from ?? { x: 0, y: 0 }, wall?.to ?? { x: 0, y: 0 }) + 1e-9,
      );
      expect(opening.kind).toBe('opening');
    }
  });

  it('keeps the carpet as one ring', () => {
    expect(scene.carpets).toHaveLength(1);
    expect(scene.carpets[0]).toHaveLength(4);
  });
});

describe('shared walls and openings of a synthetic house', () => {
  const geometry = geometryOf(syntheticScene);
  const scene = rectifyScene(geometry, estimateRectifyTransform(geometry));

  it('joins the two rooms across the halo gap into one interior wall on the mid line', () => {
    const interior = scene.walls.filter((wall) => wall.thickness === 0.1);
    expect(interior).toHaveLength(1);
    const wall = must(interior[0]);
    const hallEdge = Math.max(...must(scene.rooms[0]).polygon.outer.map((p) => p.x));
    const denEdge = Math.min(...must(scene.rooms[1]).polygon.outer.map((p) => p.x));
    expect(wall.from.x).toBeCloseTo(wall.to.x, 9);
    expect(denEdge - hallEdge).toBeCloseTo(0.1, 9);
    expect(wall.from.x).toBeCloseTo((hallEdge + denEdge) / 2, 9);
    expect(length(wall.from, wall.to)).toBeCloseTo(3, 9);
    expect(scene.walls.filter((w) => w.thickness === 0.2).length).toBe(6);
  });

  it('places the doorway on the shared wall with its width along the wall', () => {
    expect(scene.openings).toHaveLength(1);
    const opening = scene.openings[0];
    const wall = scene.walls.find((w) => w.ref === opening?.wallRef);
    expect(wall?.thickness).toBe(0.1);
    expect(opening?.width).toBeCloseTo(0.9, 9);
    expect(opening?.offset).toBeCloseTo(1, 9);
  });

  it('skips a door that crosses no wall and says why', () => {
    const lost = rectifyScene(
      geometryOf({
        ...syntheticScene,
        doors: [{ from: { x: 2, y: 1 }, to: { x: 2, y: 1.8 }, kind: 'opening', rooms: [1, 1] }],
      }),
      estimateRectifyTransform(geometry),
    );
    expect(lost.openings).toEqual([]);
    expect(lost.skipped).toEqual([{ kind: 'door', ref: 'd0', reason: 'the door crosses no wall' }]);
  });

  it('keeps unknown door kinds as plain openings and known ones as they are', () => {
    const door = { from: { x: 4.05, y: 1 }, to: { x: 4.05, y: 1.9 }, rooms: [1, 2] };
    const kinds = rectifyScene(
      geometryOf({
        ...syntheticScene,
        doors: [
          { ...door, kind: 'sliding_door' },
          { ...door, kind: 'mystery' },
        ],
      }),
      estimateRectifyTransform(geometry),
    ).openings.map((opening) => opening.kind);
    expect(kinds).toEqual(['sliding_door', 'opening']);
  });

  it('reports parts that a room cannot hold and outlines that collapsed', () => {
    const base = geometryOf(syntheticScene);
    const [first, second] = base.rooms;
    if (!first || !second) throw new Error('fixture');
    const flat = [
      { x: 0, y: 5 },
      { x: 1, y: 5 },
      { x: 2, y: 5 },
    ];
    const result = rectifyScene(
      {
        ...base,
        rooms: [
          { ...first, extraParts: [{ ring: rectRing(9, 9, 10, 10), holes: [] }] },
          { ...second, ring: flat, ref: '2' },
        ],
        carpets: [flat],
      },
      estimateRectifyTransform(base),
    );
    expect(result.rooms.map((room) => room.ref)).toEqual(['1']);
    expect(result.skipped.map((skip) => `${skip.kind}:${skip.ref}`).sort()).toEqual([
      'carpet:carpet:0',
      'room:2',
      'room_part:1',
    ]);
  });

  it('is pure: the geometry is untouched and the same input gives the same scene', () => {
    const before = JSON.stringify(geometry);
    const again = rectifyScene(geometry, estimateRectifyTransform(geometry));
    expect(again).toEqual(scene);
    expect(JSON.stringify(geometry)).toBe(before);
  });
});
