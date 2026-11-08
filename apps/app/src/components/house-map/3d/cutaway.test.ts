import { readFileSync } from 'node:fs';
import { VACUUM_SCENE, type VacuumScene } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  CUT_ENTER_FACING,
  CUT_EXIT_FACING,
  OVERHEAD_ENTER_POLAR,
  OVERHEAD_EXIT_POLAR,
  cutPositions,
  cutWalls,
  type CutView,
} from './cutaway';
import { buildStructure, type StructureGeometry } from './geometry-structure';
import { vacuumRenderScene } from '../adapters/vacuum-scene';

const NONE_FULL: ReadonlySet<string> = new Set();

const scrubbed: VacuumScene = VACUUM_SCENE.parse(
  JSON.parse(
    readFileSync(
      new URL(
        '../../../features/devices/vacuum/model/scene-geometry.fixture.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ),
);

const ISO_POLAR = 0.95;

const WALL_HEIGHT_METRES = 1.2;

function structureOf(scene: VacuumScene): StructureGeometry {
  const [floor] = vacuumRenderScene({ scene }).floors;
  if (floor === undefined) throw new Error('no floor');
  return buildStructure(
    { ...floor, openings: [] },
    {
      theme: 'light',
      wallStyle: 'low',
      lowWallHeight: WALL_HEIGHT_METRES,
      floorTone: 'room',
    },
  );
}

const FROM_SOUTH: CutView = { azimuth: 0, polar: ISO_POLAR };

const FROM_EAST: CutView = { azimuth: Math.PI / 2, polar: ISO_POLAR };

const FROM_WEST: CutView = { azimuth: -Math.PI / 2, polar: ISO_POLAR };

function room(id: number, minX: number, maxX: number): VacuumScene['rooms'][number] {
  return {
    id,
    name: `Room ${String(id)}`,
    colour: id,
    floor: 0,
    hidden: false,
    areaM2: 16,
    label: { x: (minX + maxX) / 2, y: 2 },
    rings: [
      [
        { x: minX, y: 0 },
        { x: maxX, y: 0 },
        { x: maxX, y: 4 },
        { x: minX, y: 4 },
      ],
    ],
    settings: null,
  };
}

function wall(
  [fromX, fromY]: readonly [number, number],
  [toX, toY]: readonly [number, number],
  kind: string,
): VacuumScene['walls'][number] {
  return { from: { x: fromX, y: fromY }, to: { x: toX, y: toY }, kind, height: null };
}

const SOUTH = wall([0, 0], [4, 0], 'exterior');
const EAST = wall([4, 0], [4, 4], 'exterior');
const NORTH = wall([4, 4], [0, 4], 'exterior');
const WEST = wall([0, 4], [0, 0], 'exterior');

const square = structureOf({
  ...scrubbed,
  rooms: [room(1, 0, 4)],
  walls: [SOUTH, EAST, NORTH, WEST],
});

const pair = structureOf({
  ...scrubbed,
  rooms: [room(1, 0, 4), room(2, 4, 8)],
  walls: [wall([4, 0], [4, 4], 'interior')],
});

describe('which walls are cut down', () => {
  it('cuts only the south wall of a square room seen from the south', () => {
    expect(cutWalls(square.spans, FROM_SOUTH, [], NONE_FULL)).toEqual([true, false, false, false]);
  });

  it('cuts the east wall instead once the camera turns 90 degrees', () => {
    expect(cutWalls(square.spans, FROM_EAST, [], NONE_FULL)).toEqual([false, true, false, false]);
  });

  it('cuts an interior wall from either side when it hides the room behind it', () => {
    expect(cutWalls(pair.spans, FROM_WEST, [], NONE_FULL)).toEqual([true]);
    expect(cutWalls(pair.spans, FROM_EAST, [], NONE_FULL)).toEqual([true]);
    expect(cutWalls(pair.spans, FROM_SOUTH, [], NONE_FULL)).toEqual([false]);
  });

  it('cuts a short corner stub whose room lies behind its end, not its middle', () => {
    const stub = structureOf({
      ...scrubbed,
      rooms: [room(1, 0, 4)],
      walls: [wall([4, 4.05], [4, 4], 'exterior')],
    });
    expect(cutWalls(stub.spans, FROM_EAST, [], NONE_FULL)).toEqual([true]);
    expect(cutWalls(stub.spans, FROM_WEST, [], NONE_FULL)).toEqual([false]);
  });

  it('cuts every wall to the base strip from the top camera so no inner face crowds a room', () => {
    expect(cutWalls(square.spans, { azimuth: 0, polar: 0.02 }, [], NONE_FULL)).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });

  it('never cuts a wall drawn at full height while it is selected, from any camera', () => {
    const held = square.spans[0]?.wallId;
    if (held === undefined) throw new Error('no walls');
    const full = new Set([held]);
    expect(cutWalls(square.spans, { azimuth: 0, polar: 0.02 }, [], full)).toEqual([
      false,
      true,
      true,
      true,
    ]);
    expect(cutWalls(square.spans, FROM_SOUTH, [true, false, false, false], full)[0]).toBe(false);
  });

  it('holds the overhead cut until the camera tilts past the exit angle', () => {
    const between = {
      azimuth: Math.PI / 4,
      polar: (OVERHEAD_ENTER_POLAR + OVERHEAD_EXIT_POLAR) / 2,
    };
    const allCut = [true, true, true, true];
    expect(cutWalls(square.spans, between, [], NONE_FULL)).toEqual([false, false, false, false]);
    expect(cutWalls(square.spans, between, allCut, NONE_FULL)).toEqual(allCut);
    const tilted = { ...between, polar: OVERHEAD_EXIT_POLAR + 0.01 };
    expect(cutWalls(square.spans, tilted, allCut, NONE_FULL)).toContain(false);
  });

  it('holds the last decision between the enter and exit thresholds', () => {
    const between = (CUT_ENTER_FACING + CUT_EXIT_FACING) / 2;
    const view = { azimuth: Math.acos(between), polar: Math.PI / 2 };
    expect(cutWalls(square.spans, view, [], NONE_FULL)[0]).toBe(false);
    expect(cutWalls(square.spans, view, [true, false, false, false], NONE_FULL)[0]).toBe(true);
    const past = { azimuth: Math.acos(CUT_EXIT_FACING / 2), polar: Math.PI / 2 };
    expect(cutWalls(square.spans, past, [true, false, false, false], NONE_FULL)[0]).toBe(false);
  });
});

describe('cut positions', () => {
  const layer = square.walls;

  it('lowers only the cut wall to the base strip and keeps the source', () => {
    if (layer === null) throw new Error('no walls');
    const cut = cutPositions(layer.positions, square.spans, {
      walls: [true, false, false, false],
      height: square.cutHeight,
    });
    const heights = (first: number, count: number, source: Float32Array): readonly number[] =>
      Array.from({ length: count }, (_, index) => Number(source[(first + index) * 3 + 1]));
    const [south, east] = square.spans;
    if (south === undefined || east === undefined) throw new Error('no spans');
    expect(Math.max(...heights(south.firstVertex, south.vertexCount, cut))).toBeCloseTo(0.3, 5);
    expect(Math.max(...heights(east.firstVertex, east.vertexCount, cut))).toBeCloseTo(
      WALL_HEIGHT_METRES,
      5,
    );
    expect(Math.max(...heights(south.firstVertex, south.vertexCount, layer.positions))).toBeCloseTo(
      WALL_HEIGHT_METRES,
      5,
    );
  });

  it('describes every wall of the scrubbed home and cuts some of them in the iso view', () => {
    const home = structureOf(scrubbed);
    expect(home.spans).toHaveLength(scrubbed.walls.length);
    const cut = cutWalls(home.spans, { azimuth: Math.PI / 5, polar: ISO_POLAR }, [], NONE_FULL);
    expect(cut.some(Boolean)).toBe(true);
    expect(cut.every(Boolean)).toBe(false);
  });
});
