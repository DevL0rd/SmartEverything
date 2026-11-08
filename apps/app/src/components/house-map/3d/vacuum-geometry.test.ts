import type { VacuumScene, VacuumTrailRun } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCENE_OPTIONS,
  NOMINAL_WALL_HEIGHT_METRES,
  ROBOT_HEIGHT_METRES,
  buildSceneGeometry,
  robotPlacement,
  simplifyPoints,
  turretElevation,
  type MeshLayer,
  type SceneGeometry,
  type SceneOptions,
} from './vacuum-geometry';
import { VACUUM_QUALITY_TARGET } from './quality-target';
import { fitTrail } from './vacuum-trail';
import { scrubbedScene, vacuumInput } from './scene-input-fixture';
import { floorOf } from '../lighting-fixture';

const scrubbed = scrubbedScene;

function geometryOf(scene: VacuumScene, options?: SceneOptions): SceneGeometry {
  return buildSceneGeometry(vacuumInput(scene), options);
}

function square(x: number, y: number, size: number): VacuumScene['rooms'][number]['rings'][number] {
  return [
    { x, y },
    { x: x + size, y },
    { x: x + size, y: y + size },
    { x, y: y + size },
  ];
}

function sceneWith(extra: Partial<VacuumScene>): VacuumScene {
  return { ...scrubbed, ...extra };
}

function expectQualityTarget(geometry: SceneGeometry): void {
  expect(geometry.stats.triangles).toBeLessThan(VACUUM_QUALITY_TARGET.triangles);
  expect(geometry.stats.drawCalls).toBeLessThan(VACUUM_QUALITY_TARGET.drawCalls);
}

function expectEveryRunKept(runs: readonly VacuumTrailRun[], geometry: SceneGeometry): void {
  const fitted = fitTrail(runs, geometry.stats.trailSegments);
  expect(fitted.segments).toBe(geometry.stats.trailSegments);
  expect(fitted.runs).toHaveLength(runs.length);
  fitted.runs.forEach((run, index) => {
    const source = runs[index]?.points ?? [];
    expect(run.mopping).toBe(runs[index]?.mopping);
    expect(run.points.length).toBeGreaterThanOrEqual(2);
    expect(run.points.length).toBeLessThanOrEqual(source.length);
    expect(run.points[0]).toEqual(source[0]);
    expect(run.points.at(-1)).toEqual(source.at(-1));
  });
}

function layersOf(geometry: SceneGeometry): readonly MeshLayer[] {
  return [...geometry.base, ...geometry.trail, ...geometry.robot];
}

function layerNamed(geometry: SceneGeometry, id: string): MeshLayer {
  const layer = layersOf(geometry).find((candidate) => candidate.id === id);
  if (layer === undefined) throw new Error(`no layer ${id}`);
  return layer;
}

function extent(layer: MeshLayer, axis: 0 | 1 | 2): { min: number; max: number } {
  const values = Array.from({ length: layer.positions.length / 3 }, (_, index) =>
    Number(layer.positions[index * 3 + axis]),
  );
  return { min: Math.min(...values), max: Math.max(...values) };
}

function corner(layer: MeshLayer, index: number): readonly [number, number, number] {
  return [
    Number(layer.positions[index * 3]),
    Number(layer.positions[index * 3 + 1]),
    Number(layer.positions[index * 3 + 2]),
  ];
}

function faceNormal(layer: MeshLayer, triangle: number): readonly [number, number, number] {
  const [a, b, c] = [0, 1, 2].map((offset) =>
    corner(layer, Number(layer.indices[triangle * 3 + offset])),
  );
  if (a === undefined || b === undefined || c === undefined) throw new Error('missing corner');
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as const;
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]] as const;
  return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
}

function vertexNormal(layer: MeshLayer, triangle: number): readonly [number, number, number] {
  const index = Number(layer.indices[triangle * 3]);
  return [
    Number(layer.normals[index * 3]),
    Number(layer.normals[index * 3 + 1]),
    Number(layer.normals[index * 3 + 2]),
  ];
}

function walk(count: number, mopping: boolean): VacuumTrailRun {
  return {
    mopping,
    points: Array.from({ length: count }, (_, index) => ({
      x: 11 + (index % 400) * 0.01,
      y: -8 + Math.floor(index / 400) * 0.05 + Math.sin(index) * 0.004,
    })),
  };
}

describe('scene geometry on the scrubbed scene', () => {
  const geometry = geometryOf(scrubbed);

  it('meets the vacuum quality target and keeps every room', () => {
    expectQualityTarget(geometry);
    expect(geometry.rooms).toHaveLength(scrubbed.rooms.length);
    expect(geometry.stats.triangles).toBe(
      layersOf(geometry).reduce((sum, layer) => sum + layer.triangles, 0),
    );
    expect(geometry.stats.drawCalls).toBe(layersOf(geometry).length);
  });

  it('keeps the vacuum page geometry of the robot map as it was before the shared path', () => {
    expect(geometry.stats).toEqual({
      triangles: 1484,
      drawCalls: 6,
      trailToleranceMetres: 0,
      trailSegments: 0,
    });
    expect(geometry.base.map((layer) => [layer.id, layer.triangles])).toEqual([
      ['floor', 18],
      ['walls', 360],
      ['carpets', 2],
      ['dock', 264],
    ]);
    expect(
      geometry.rooms.map((range) => [range.roomId, range.firstTriangle, range.triangleCount]),
    ).toEqual([
      ['3', 0, 4],
      ['4', 4, 2],
      ['5', 6, 6],
      ['6', 12, 2],
      ['8', 14, 4],
    ]);
    expect(geometry.walls).toHaveLength(36);
    expect(geometry.labels).toHaveLength(5);
    expect(geometry.frame.centre[0]).toBeCloseTo(14.149, 6);
    expect(geometry.frame.centre[2]).toBeCloseTo(4.874, 6);
    expect(geometry.frame.radius).toBeCloseTo(6.780673938665683, 9);
  });

  it('leaves robot map doors out of the walls while a home map cuts its openings', () => {
    const input = vacuumInput(scrubbed);
    expect(input.floor.openings.length).toBeGreaterThan(0);
    const cut = buildSceneGeometry({ ...input, source: 'home_map' });
    expect(cut.walls.length).not.toBe(geometry.walls.length);
  });

  it('has one layer per kind of content and nothing for what the scene lacks', () => {
    expect(geometry.base.map((layer) => layer.id)).toEqual(['floor', 'walls', 'carpets', 'dock']);
    expect(geometry.trail).toEqual([]);
    expect(geometry.robot.map((layer) => layer.id)).toEqual(['robot-body', 'robot-turret']);
  });

  it('triangulates every room outline and extrudes every wall into one mesh', () => {
    expect(scrubbed.rooms).toHaveLength(5);
    expect(layerNamed(geometry, 'floor').triangles).toBe(18);
    expect(scrubbed.walls).toHaveLength(36);
    expect(layerNamed(geometry, 'walls').triangles).toBe(36 * 10);
    expect(layerNamed(geometry, 'carpets').triangles).toBe(2);
  });

  it('puts the map on the floor with y up and the map y axis along -z', () => {
    const floor = layerNamed(geometry, 'floor');
    const x = extent(floor, 0);
    const z = extent(floor, 2);
    expect(extent(floor, 1)).toEqual({ min: 0, max: 0 });
    expect(x.min).toBeGreaterThanOrEqual(scrubbed.bounds.minX - 1e-6);
    expect(x.max).toBeLessThanOrEqual(scrubbed.bounds.maxX + 1e-6);
    expect(-z.max).toBeGreaterThanOrEqual(scrubbed.bounds.minY - 1e-6);
    expect(-z.min).toBeLessThanOrEqual(scrubbed.bounds.maxY + 1e-6);
  });

  it('keeps the arrays of every layer consistent and every face pointing outward', () => {
    for (const layer of layersOf(geometry)) {
      const vertices = layer.positions.length / 3;
      expect(layer.normals).toHaveLength(vertices * 3);
      expect(layer.colours).toHaveLength(vertices * 3);
      expect(layer.uvs).toHaveLength(vertices * 2);
      expect(layer.indices.length).toBe(layer.triangles * 3);
      expect(Math.max(...layer.indices)).toBeLessThan(vertices);
      for (let triangle = 0; triangle < layer.triangles; triangle += 1) {
        const actual = faceNormal(layer, triangle);
        const stored = vertexNormal(layer, triangle);
        const facing = actual[0] * stored[0] + actual[1] * stored[1] + actual[2] * stored[2];
        expect(facing, `${layer.id} triangle ${String(triangle)}`).toBeGreaterThan(0);
      }
    }
  });

  it('records the floor triangles of every visible room for picking', () => {
    expect(geometry.rooms.map((range) => range.roomId)).toEqual(
      scrubbed.rooms.map((room) => String(room.id)),
    );
    const covered = geometry.rooms.reduce((sum, range) => sum + range.triangleCount, 0);
    expect(covered).toBe(layerNamed(geometry, 'floor').triangles);
    geometry.rooms.reduce((expected, range) => {
      expect(range.firstTriangle).toBe(expected);
      return expected + range.triangleCount;
    }, 0);
  });

  it('leaves hidden rooms out of the floor', () => {
    const [first, ...rest] = scrubbed.rooms;
    if (first === undefined) throw new Error('no room');
    const hidden = geometryOf(sceneWith({ rooms: [{ ...first, hidden: true }, ...rest] }));
    expect(hidden.rooms.map((range) => range.roomId)).not.toContain(String(first.id));
    expect(layerNamed(hidden, 'floor').triangles).toBeLessThan(
      layerNamed(geometry, 'floor').triangles,
    );
  });

  it('frames the whole map around its centre', () => {
    const { minX, minY, maxX, maxY } = scrubbed.bounds;
    expect(geometry.frame.centre).toEqual([(minX + maxX) / 2, 0, -(minY + maxY) / 2]);
    expect(geometry.frame.radius).toBeGreaterThan(Math.hypot(maxX - minX, maxY - minY) / 2);
  });

  it('is deterministic and keyed by the scene version', () => {
    expect(geometryOf(scrubbed)).toEqual(geometry);
    expect(geometry.version).toBe(vacuumInput(scrubbed).key);
    expect(geometry.version).toMatch(/^vacuum:7:current:/u);
  });
});

describe('walls', () => {
  it('rise to the nominal height on a robot map and to the ceiling on a home map', () => {
    expect(NOMINAL_WALL_HEIGHT_METRES).toBe(1.2);
    expect(extent(layerNamed(geometryOf(scrubbed), 'walls'), 1).max).toBeCloseTo(1.2, 5);
    const floor = {
      ...floorOf([]),
      walls: [
        {
          id: 'wall-a',
          from: { x: 0, y: 0 },
          to: { x: 8, y: 0 },
          thickness: 0.1,
          height: 2.5,
          kind: 'solid' as const,
          exterior: true,
        },
      ],
    };
    const home = buildSceneGeometry({ key: 'home', source: 'home_map', floor });
    expect(extent(layerNamed(home, 'walls'), 1).max).toBeCloseTo(2.5, 5);
    expect(home.robot).toEqual([]);
  });

  it('use the height a wall carries over the nominal one', () => {
    const [wall] = scrubbed.walls;
    if (wall === undefined) throw new Error('no wall');
    const geometry = geometryOf(sceneWith({ walls: [{ ...wall, height: 1.1 }] }));
    expect(extent(layerNamed(geometry, 'walls'), 1).max).toBeCloseTo(1.1, 5);
  });

  it('skip a wall of no length', () => {
    const zero = { from: { x: 1, y: 1 }, to: { x: 1, y: 1 }, kind: 'interior', height: null };
    expect(geometryOf(sceneWith({ walls: [zero] })).base.map((layer) => layer.id)).not.toContain(
      'walls',
    );
  });
});

describe('zones', () => {
  const zones = [
    { id: 1, kind: 'no_go', points: square(12, -7, 1) },
    { id: 2, kind: 'no_mop', points: square(14, -6, 1) },
    {
      id: 3,
      kind: 'wall',
      points: [
        { x: 11, y: -3 },
        { x: 13, y: -3 },
        { x: 13, y: -2 },
      ],
    },
    { id: 4, kind: 'hidden', points: square(15, -3, 1) },
  ];
  const geometry = geometryOf(sceneWith({ zones }));

  it('draw no-go and no-mop areas as translucent prisms and virtual walls as thin ones', () => {
    expect(layerNamed(geometry, 'no-go').opacity).toBeLessThan(1);
    expect(layerNamed(geometry, 'no-go').triangles).toBe(2 + 4 * 2);
    expect(layerNamed(geometry, 'no-mop').triangles).toBe(2 + 4 * 2);
    expect(layerNamed(geometry, 'virtual-walls').triangles).toBe(2 * 10);
    expect(extent(layerNamed(geometry, 'no-go'), 1).max).toBeGreaterThan(0.3);
  });

  it('leave hidden zones out and colour the two area kinds differently', () => {
    expect(layersOf(geometry).filter((layer) => layer.id.startsWith('no-'))).toHaveLength(2);
    const noGo = layerNamed(geometry, 'no-go').colours.slice(0, 3);
    const noMop = layerNamed(geometry, 'no-mop').colours.slice(0, 3);
    expect(Array.from(noGo)).not.toEqual(Array.from(noMop));
  });
});

describe('trail ribbon', () => {
  it('draws sweep and mop runs as two layers of two triangles per segment above the carpets', () => {
    const trail = [walk(40, false), walk(25, true)];
    const geometry = geometryOf(sceneWith({ trail }));
    expect(layerNamed(geometry, 'trail-sweep').triangles).toBe(39 * 2);
    expect(layerNamed(geometry, 'trail-mop').triangles).toBe(24 * 2);
    expect(geometry.stats.trailToleranceMetres).toBe(0);
    expect(extent(layerNamed(geometry, 'trail-sweep'), 1).min).toBeGreaterThan(0.012);
  });

  it('meets the quality target for a very long clean by simplifying the line, never dropping a run', () => {
    const trail = [walk(60_000, false), walk(60_000, true), walk(30_000, false)];
    const geometry = geometryOf(sceneWith({ trail }));
    expectQualityTarget(geometry);
    expectEveryRunKept(trail, geometry);
    expect(geometry.stats.trailToleranceMetres).toBeGreaterThan(0);
    expect(geometry.trail.map((layer) => layer.id)).toEqual(['trail-sweep', 'trail-mop']);
  });

  it('ignores runs of fewer than two points', () => {
    const geometry = geometryOf(
      sceneWith({ trail: [{ mopping: false, points: [{ x: 1, y: 1 }] }] }),
    );
    expect(geometry.trail).toEqual([]);
  });
});

describe('simplifyPoints', () => {
  it('drops points on the line and keeps the corner and both ends', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
    ];
    expect(simplifyPoints(points, 0.01)).toEqual([points[0], points[2], points[4]]);
  });

  it('keeps everything when the tolerance is zero and the line bends', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 1, y: 0.1 },
      { x: 2, y: 0 },
    ];
    expect(simplifyPoints(points, 0)).toEqual(points);
  });
});

describe('the whole home at the limit', () => {
  const rooms = Array.from({ length: 20 }, (_, id) => ({
    id,
    name: `Room ${String(id)}`,
    colour: id,
    floor: 0,
    hidden: false,
    areaM2: 9,
    label: { x: id, y: 0 },
    rings: [
      Array.from({ length: 64 }, (_, step) => ({
        x: (id % 5) * 4 + 1.5 + 1.5 * Math.cos((step / 64) * 2 * Math.PI),
        y: Math.floor(id / 5) * 4 + 1.5 + 1.5 * Math.sin((step / 64) * 2 * Math.PI),
      })),
    ],
    settings: null,
  }));
  const walls = Array.from({ length: 200 }, (_, index) => ({
    from: { x: index * 0.1, y: 0 },
    to: { x: index * 0.1, y: 3 },
    kind: index % 2 === 0 ? 'exterior' : 'interior',
    height: null,
  }));
  const trail = [walk(80_000, false), walk(80_000, true)];
  const zones = Array.from({ length: 30 }, (_, id) => ({
    id,
    kind: id % 3 === 0 ? 'no_go' : id % 3 === 1 ? 'no_mop' : 'wall',
    points: square(id, id, 1),
  }));
  const geometry = geometryOf({
    ...scrubbed,
    rooms,
    walls,
    zones,
    trail,
  });

  it('meets the vacuum quality target while keeping every room and every trail run', () => {
    expectQualityTarget(geometry);
    expect(geometry.rooms).toHaveLength(20);
    expectEveryRunKept(trail, geometry);
    expect(geometry.stats.trailToleranceMetres).toBeGreaterThan(0);
  });
});

describe('robot and dock', () => {
  it('places the robot on the floor facing its heading', () => {
    expect(robotPlacement({ x: 2, y: 3, yaw: 0.5 })).toEqual({
      position: [2, 0, -3],
      rotationY: 0.5,
    });
  });

  it('builds a 35 cm puck 9 cm tall with a turret as its own layer', () => {
    const geometry = geometryOf(scrubbed);
    const body = layerNamed(geometry, 'robot-body');
    expect(extent(body, 0).max).toBeCloseTo(0.175, 3);
    expect(extent(body, 0).min).toBeCloseTo(-0.175, 3);
    expect(extent(body, 1).min).toBe(0);
    expect(extent(body, 1).max).toBeGreaterThanOrEqual(ROBOT_HEIGHT_METRES);
    expect(extent(body, 1).max).toBeLessThan(ROBOT_HEIGHT_METRES + 0.02);
  });

  it('raises the turret from flush to fully out and clamps the input', () => {
    const flush = turretElevation(0);
    const out = turretElevation(1);
    expect(out).toBeGreaterThan(flush);
    expect(turretElevation(-3)).toBe(flush);
    expect(turretElevation(9)).toBe(out);
    expect(turretElevation(0.5)).toBeCloseTo((flush + out) / 2, 6);
  });

  it('turns the dock with its pose and leaves it out without one', () => {
    const north = geometryOf(sceneWith({ dock: { x: 5, y: 5, yaw: 0 } }));
    const east = geometryOf(sceneWith({ dock: { x: 5, y: 5, yaw: Math.PI / 2 } }));
    const northDock = layerNamed(north, 'dock');
    const eastDock = layerNamed(east, 'dock');
    expect(extent(northDock, 0).max - extent(northDock, 0).min).toBeCloseTo(
      extent(eastDock, 2).max - extent(eastDock, 2).min,
      5,
    );
    expect(extent(northDock, 0).min).toBeLessThan(5);
    const none = geometryOf(sceneWith({ dock: null }));
    expect(none.base.map((layer) => layer.id)).not.toContain('dock');
    expect(none.dock).toBeNull();
  });
});

describe('themes', () => {
  it('colour the floor differently in light and dark', () => {
    const light = layerNamed(
      geometryOf(scrubbed, { ...DEFAULT_SCENE_OPTIONS, theme: 'light' }),
      'floor',
    );
    const dark = layerNamed(
      geometryOf(scrubbed, { ...DEFAULT_SCENE_OPTIONS, theme: 'dark' }),
      'floor',
    );
    expect(Array.from(light.colours.slice(0, 3))).not.toEqual(Array.from(dark.colours.slice(0, 3)));
  });
});

describe('an empty map', () => {
  it('builds only the robot', () => {
    const geometry = geometryOf(
      sceneWith({
        rooms: [],
        walls: [],
        carpets: [],
        zones: [],
        dock: null,
        robot: null,
        trail: [],
      }),
    );
    expect(geometry.base).toEqual([]);
    expect(geometry.robot).toHaveLength(2);
  });
});
