import {
  HOME_MAP_SCHEMA_VERSION,
  HOME_MAP_WRITE,
  type HomeMap,
  homeMapPolygonArea,
  homeMapSceneWithinTolerance,
  homeMapWallLength,
  vacuumSceneToSourceGeometry,
  type VacuumScene,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  HOME_MAP_ROBOT_BOX_MODEL_ID,
  HOME_MAP_RUG_MODEL_ID,
  HOME_MAP_UNSET_FLOOR,
  firstImport,
  orientedBox,
  type FirstImportInput,
  type FirstImportResult,
} from '../../src/home-map/merge/first-import';
import { rectifyScene } from '../../src/home-map/merge/rectify';
import { fixtureScene, rectRing, rotateScene, syntheticScene } from './scene-fixtures';

const DEVICE = '3f2b8c1e-5d4a-4b6f-9a77-1c2d3e4f5a6b';
const NOW = '2026-10-25T10:00:00.000Z';

const run = (scene: VacuumScene): FirstImportResult => {
  let counter = 0;
  const input: FirstImportInput = {
    geometry: vacuumSceneToSourceGeometry(scene),
    sourceKind: 'xiaomi_vacuum',
    sourceId: 'src-1',
    deviceId: DEVICE,
    floorId: 'floor-0',
    importedAt: NOW,
    newId: () => `id-${String((counter += 1))}`,
  };
  return firstImport(input);
};

const asMap = (result: FirstImportResult): HomeMap =>
  HOME_MAP_WRITE.parse({
    id: 'home',
    schemaVersion: HOME_MAP_SCHEMA_VERSION,
    revision: 1,
    name: 'Home',
    north: 0,
    updatedAt: NOW,
    floors: [
      {
        id: 'floor-0',
        name: 'Ground',
        level: 0,
        elevation: 0,
        ceilingHeight: 2.6,
        rooms: result.rooms,
        walls: result.walls,
        openings: result.openings,
        objects: result.objects,
        placements: result.placements,
        annotations: [],
      },
    ],
    sources: [result.source],
    notices: [],
  });

describe('the first import of the synthetic vacuum fixture', () => {
  const result = run(fixtureScene);

  it('is a valid house map in the strict writer schema', () => {
    const map = asMap(result);
    expect(map.floors[0]?.rooms).toHaveLength(5);
    expect(map.sources[0]?.lastVersion).toBe('101:current');
    expect(map.sources[0]?.lastImportedAt).toBe(NOW);
    expect(map.sources[0]?.tombstones).toEqual([]);
  });

  it('brings every robot room in with its ref, its name, its area and a source origin', () => {
    expect(result.rooms.map((room) => room.origin)).toEqual(
      ['3', '4', '5', '6', '8'].map((ref) => ({
        kind: 'source',
        sourceId: 'src-1',
        ref,
        overridden: [],
      })),
    );
    result.rooms.forEach((room, index) => {
      const robot = fixtureScene.rooms[index];
      expect(room.name).toBe(robot?.name);
      expect(room.homeRoomId).toBeNull();
      expect(room.wallPaint).toBeNull();
      expect(room.colourSlot).toBe(index + 1);
      expect(homeMapPolygonArea(room.polygon)).toBeCloseTo(robot?.areaM2 ?? NaN, 0);
    });
  });

  it('puts the map on the house frame: the minimum corner of the geometry at 0.5, 0.5', () => {
    const points = result.walls.flatMap((wall) => [wall.from, wall.to]);
    expect(Math.min(...points.map((p) => p.x))).toBeGreaterThan(0.5 - 1e-9);
    expect(result.source.transform.rotationDeg).toBeCloseTo(0, 0);
    expect(result.source.transform.mirrored).toBe(false);
  });

  it('generates interior walls of 0.1 m and exterior walls of 0.2 m, all solid and from the source', () => {
    expect(new Set(result.walls.map((wall) => wall.thickness))).toEqual(new Set([0.1, 0.2]));
    expect(result.walls.every((wall) => wall.kind === 'solid' && wall.height === null)).toBe(true);
    expect(result.walls.every((wall) => wall.origin.kind === 'source')).toBe(true);
    expect(result.walls.every((wall) => homeMapWallLength(wall) > 0)).toBe(true);
  });

  it('turns scene doors into openings that reference real walls of the same import', () => {
    const wallIds = new Set(result.walls.map((wall) => wall.id));
    expect(result.openings.length).toBeGreaterThan(0);
    expect(result.openings.every((opening) => wallIds.has(opening.wallId))).toBe(true);
    expect(result.openings.length + result.skipped.filter((s) => s.kind === 'door').length).toBe(
      fixtureScene.doors.length,
    );
  });

  it('turns the carpet into one rug and the dock into the vacuum placement', () => {
    const rugs = result.objects.filter((object) => object.modelId === HOME_MAP_RUG_MODEL_ID);
    expect(rugs).toHaveLength(1);
    expect(rugs[0]?.params['width']).toBeCloseTo(1, 2);
    expect(rugs[0]?.params['depth']).toBeCloseTo(2, 2);
    expect(result.placements).toHaveLength(1);
    expect(result.placements[0]).toMatchObject({
      deviceId: DEVICE,
      floorId: 'floor-0',
      mount: 'floor',
      auto: false,
      height: 0,
      camera: null,
    });
    expect(result.placements[0]?.rotation).toBeCloseTo(-90, 1);
  });

  it('keeps the base for later merges: the same scene is within tolerance of it', () => {
    const geometry = vacuumSceneToSourceGeometry(fixtureScene);
    const again = rectifyScene(geometry, {
      rotationDeg: result.source.transform.rotationDeg,
      tx: result.source.transform.tx,
      ty: result.source.transform.ty,
      mirrored: false,
    });
    expect(homeMapSceneWithinTolerance(result.source.base, again)).toBe(true);
  });

  it('is deterministic and gives each element its own id', () => {
    expect(run(fixtureScene)).toEqual(result);
    const ids = [
      ...result.rooms.map((e) => e.id),
      ...result.walls.map((e) => e.id),
      ...result.openings.map((e) => e.id),
      ...result.objects.map((e) => e.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('the first import of a robot map that was turned in its own frame', () => {
  const upright = run(fixtureScene);
  const turned = run(rotateScene(fixtureScene, 29, -12, 7));

  it('rectifies it to the same house as the upright map', () => {
    expect(turned.source.transform.rotationDeg).toBeCloseTo(-29, 0);
    expect(turned.rooms).toHaveLength(upright.rooms.length);
    expect(turned.walls).toHaveLength(upright.walls.length);
    expect(turned.openings).toHaveLength(upright.openings.length);
    turned.rooms.forEach((room, index) => {
      const other = upright.rooms[index];
      expect(homeMapPolygonArea(room.polygon)).toBeCloseTo(
        homeMapPolygonArea(other?.polygon ?? { outer: [], holes: [] }),
        1,
      );
    });
    expect(turned.walls.every((w) => w.from.x === w.to.x || w.from.y === w.to.y)).toBe(true);
  });
});

describe('the first import of a synthetic house', () => {
  const result = run(syntheticScene);

  it('is a valid map with two rooms, one shared wall and one doorway on it', () => {
    asMap(result);
    expect(result.rooms).toHaveLength(2);
    const shared = result.walls.filter((wall) => wall.thickness === 0.1);
    expect(shared).toHaveLength(1);
    expect(result.openings).toHaveLength(1);
    expect(result.openings[0]?.wallId).toBe(shared[0]?.id);
    expect(result.openings[0]).toMatchObject({
      kind: 'opening',
      sillHeight: 0,
      headHeight: 2,
      contactDeviceId: null,
      lockDeviceId: null,
    });
  });

  it('imports a known robot floor and keeps an unknown code as a number in the base', () => {
    expect(result.rooms[0]?.floorMaterial).toEqual({ kind: 'wood', variant: null, tint: null });
    expect(result.rooms[1]?.floorMaterial).toEqual(HOME_MAP_UNSET_FLOOR);
    expect(result.source.base.rooms.map((room) => room['floorCode'])).toEqual([4010, 9999]);
  });

  it('maps robot furniture to library objects and the rest to a labelled box', () => {
    const [rug, bed, box] = result.objects;
    expect(rug?.modelId).toBe(HOME_MAP_RUG_MODEL_ID);
    expect(bed).toMatchObject({
      modelId: 'cat.bedroom.single-bed',
      label: 'Single bed',
      rotation: 0,
      elevation: 0,
      locked: false,
    });
    expect(Object.keys(bed?.params ?? {})).toEqual(['width', 'depth']);
    expect(bed?.params['width']).toBeCloseTo(0.9, 9);
    expect(bed?.params['depth']).toBeCloseTo(2, 9);
    expect(bed?.at.x).toBeCloseTo(6.5, 9);
    expect(box).toMatchObject({ modelId: HOME_MAP_ROBOT_BOX_MODEL_ID, label: 'Strange gadget' });
    expect(box?.params['height']).toBe(0.7);
    expect(box?.origin).toMatchObject({ kind: 'source', ref: 'furniture:1' });
  });

  it('places the dock as the vacuum with the robot heading', () => {
    expect(result.placements[0]?.rotation).toBeCloseTo(90, 6);
    expect(result.placements[0]?.at.x).toBeCloseTo(1, 9);
    expect(result.placements[0]?.at.y).toBeCloseTo(3, 9);
  });

  it('keeps the rectified dock in the source base for the frame match', () => {
    expect(result.source.base['dock']).toEqual({
      at: result.placements[0]?.at,
      yawDeg: result.placements[0]?.rotation,
    });
  });

  it('imports a jittered copy of itself as the same house within the no-op tolerance', () => {
    const jitter = (value: number, index: number): number =>
      value + (index % 2 === 0 ? 0.008 : -0.008);
    const shaken: VacuumScene = {
      ...syntheticScene,
      rooms: syntheticScene.rooms.map((room) => ({
        ...room,
        rings: room.rings.map((ring) => ring.map((p, i) => ({ x: jitter(p.x, i), y: p.y }))),
      })),
    };
    const geometry = vacuumSceneToSourceGeometry(shaken);
    const again = rectifyScene(geometry, {
      rotationDeg: result.source.transform.rotationDeg,
      tx: result.source.transform.tx,
      ty: result.source.transform.ty,
      mirrored: false,
    });
    expect(homeMapSceneWithinTolerance(result.source.base, again)).toBe(true);
    const moved = rectifyScene(geometry, {
      rotationDeg: result.source.transform.rotationDeg,
      tx: result.source.transform.tx + 0.05,
      ty: result.source.transform.ty,
      mirrored: false,
    });
    expect(homeMapSceneWithinTolerance(result.source.base, moved)).toBe(false);
  });

  it('writes nothing for a missing dock', () => {
    expect(run({ ...syntheticScene, dock: null }).placements).toEqual([]);
  });

  it('reports what it could not bring in instead of dropping it silently', () => {
    const flat = [
      { x: 0, y: 5 },
      { x: 1, y: 5 },
      { x: 2, y: 5 },
    ];
    const odd = run({ ...syntheticScene, carpets: [{ id: 1, kind: 'ai', ring: flat }] });
    expect(odd.skipped).toEqual([
      { kind: 'carpet', ref: 'carpet:0', reason: 'the outline collapsed' },
    ]);
    expect(odd.objects.some((object) => object.modelId === HOME_MAP_RUG_MODEL_ID)).toBe(false);
  });
});

describe('the oriented box of an outline', () => {
  it('measures an axis aligned rectangle with no turn', () => {
    const box = orientedBox(rectRing(1, 2, 4, 3));
    expect(box).toMatchObject({ width: 1, depth: 3, rotationDeg: 0 });
    expect(box.centre).toEqual({ x: 2.5, y: 2.5 });
  });

  it('finds the turn of a rotated rectangle', () => {
    const box = orientedBox(
      rotateScene(
        { ...fixtureScene, carpets: [{ id: 1, kind: 'ai', ring: rectRing(0, 0, 4, 1) }] },
        30,
      ).carpets[0]?.ring ?? [],
    );
    expect(box.rotationDeg).toBeCloseTo(30, 6);
    expect(box.width).toBeCloseTo(1, 6);
    expect(box.depth).toBeCloseTo(4, 6);
  });
});
