import type {
  HomeMap,
  HomeMapFloor,
  HomeMapOp,
  HomeMapPlacement,
  HomeMapSource,
  HomeMapWall,
} from '@smarteverything/domain';
import {
  HOME_MAP_FLOOR_ID,
  HOME_MAP_MAP_ID,
  vacuumSceneToSourceGeometry,
} from '@smarteverything/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { rectifyScene } from '../../src/home-map/merge/rectify';
import type { StructureScene } from '../../src/home-map/merge/reimport-structure';
import { HomeMapReset, planReset } from '../../src/home-map/reset';
import type { HomeMapService } from '../../src/home-map/service';
import { testLogger } from '../support/logs';
import { USER, newId, planFor } from './import-fixtures';
import { storedService } from './store-fixtures';
import { syntheticScene } from './scene-fixtures';

const geometry = vacuumSceneToSourceGeometry(syntheticScene);
const sceneOf = (source: HomeMapSource): StructureScene => rectifyScene(geometry, source.transform);
const MAIN = HOME_MAP_MAP_ID.parse('home');
const LAMP = '3f2b8f9a-6d3c-4d6e-8d4e-0a1b2c3d4e5f';

let service: HomeMapService;
let reset: HomeMapReset;

const floorOf = (map: HomeMap): HomeMapFloor => {
  const floor = map.floors[0];
  if (!floor) throw new Error('no floor');
  return floor;
};

const importRobot = (): void => {
  const plan = planFor(service.get(), syntheticScene);
  if (plan.kind === 'noop') throw new Error('nothing imported');
  service.apply(plan.ops, plan.actor);
};

const lamp: HomeMapPlacement = {
  deviceId: LAMP,
  floorId: HOME_MAP_FLOOR_ID.parse('floor-0'),
  at: { x: 1, y: 1 },
  rotation: 0,
  height: 1,
  tilt: 0,
  mount: 'floor',
  auto: false,
  camera: null,
};

const sofa = (): HomeMapOp => ({
  op: 'add',
  kind: 'object',
  floorId: 'floor-0',
  element: {
    id: 'sofa',
    modelId: 'cat.seating.sofa',
    finish: null,
    params: {},
    at: { x: 1, y: 1 },
    rotation: 0,
    elevation: 0,
    label: null,
    locked: false,
    origin: { kind: 'hand' },
  },
});

const interiorWall = (map: HomeMap): HomeMapWall => {
  const wall = floorOf(map).walls.find((w) => w.from.x === w.to.x && w.thickness < 0.15);
  if (!wall) throw new Error('no wall');
  return wall;
};

const editedMap = (): { readonly imported: HomeMap; readonly edited: HomeMap } => {
  importRobot();
  const before = service.get();
  const hall = floorOf(before).rooms.find((r) => r.name === 'Hall');
  if (!hall) throw new Error('no hall');
  const wall = interiorWall(before);
  const opening = floorOf(before).openings[0];
  if (!opening) throw new Error('no opening');
  service.apply(
    [
      {
        op: 'update',
        kind: 'room',
        floorId: 'floor-0',
        id: hall.id,
        patch: {
          polygon: {
            outer: [
              { x: 0, y: 0 },
              { x: 3, y: 0 },
              { x: 3, y: 3 },
              { x: 0, y: 3 },
            ],
            holes: [],
          },
          name: 'Lounge',
        },
      },
      {
        op: 'update',
        kind: 'wall',
        floorId: 'floor-0',
        id: wall.id,
        patch: {
          from: { x: wall.from.x - 0.6, y: wall.from.y },
          to: { x: wall.to.x - 0.6, y: wall.to.y },
        },
      },
      { op: 'remove', kind: 'opening', floorId: 'floor-0', id: opening.id },
      sofa(),
      { op: 'add', kind: 'placement', floorId: 'floor-0', element: lamp },
    ],
    USER,
  );
  const again = planFor(service.get(), syntheticScene);
  if (again.kind !== 'noop') service.apply(again.ops, again.actor);
  return { imported: before, edited: service.get() };
};

beforeEach(() => {
  service = storedService();
  reset = new HomeMapReset({
    maps: service,
    geometryOf: (): typeof geometry => geometry,
    newId,
    log: testLogger('home-map'),
  });
});

describe('reset to the robot map', () => {
  it('restores shapes, walls, openings and tombstones, keeps objects, placements and names', () => {
    const { imported, edited } = editedMap();
    const source = edited.sources[0];
    expect(source?.tombstones).toHaveLength(1);
    const answer = reset.reset(MAIN, USER);
    const after = service.get();
    expect(answer.revision).toBe(edited.revision + 1);
    expect(answer.conflicts).toEqual([]);
    const hall = floorOf(after).rooms.find((r) => r.name === 'Lounge');
    const baseHall = after.sources[0]?.base.rooms.find((r) => r.ref === '1');
    expect(hall?.polygon).toEqual(baseHall?.polygon);
    expect(hall?.origin).toMatchObject({ kind: 'source', overridden: ['name'] });
    expect(interiorWall(after).from).toEqual(interiorWall(imported).from);
    expect(floorOf(after).openings).toHaveLength(1);
    expect(floorOf(after).openings[0]?.origin).toMatchObject({ overridden: [] });
    expect(after.sources[0]?.tombstones).toEqual([]);
    expect(floorOf(after).objects).toEqual(floorOf(edited).objects);
    expect(floorOf(after).placements).toEqual(floorOf(edited).placements);
  });

  it('is one revision and one undo brings the edits back', () => {
    const { edited } = editedMap();
    reset.reset(MAIN, USER);
    expect(service.revisions({ mapId: MAIN }).at(-1)?.actor).toBe(USER);
    service.undo(USER);
    const undone = service.get();
    expect(floorOf(undone).rooms).toEqual(floorOf(edited).rooms);
    expect(floorOf(undone).walls).toEqual(floorOf(edited).walls);
    expect(floorOf(undone).openings).toEqual(floorOf(edited).openings);
    expect(undone.sources[0]?.tombstones).toEqual(edited.sources[0]?.tombstones);
    service.redo(USER);
    expect(floorOf(service.get()).openings).toHaveLength(1);
  });

  it('writes nothing when the map already is the robot map', () => {
    importRobot();
    const revision = service.revision();
    expect(reset.reset(MAIN, USER)).toEqual({ revision, conflicts: [] });
    expect(service.revision()).toBe(revision);
  });

  it('resets only the chosen source and refuses an unknown one', () => {
    const { edited } = editedMap();
    expect(() => planReset({ map: edited, sourceId: 'nothing', sceneOf, newId })).toThrow();
    expect(planReset({ map: edited, sourceId: 'src-1', sceneOf, newId }).length).toBeGreaterThan(0);
    expect(planReset({ map: { ...edited, sources: [] }, sceneOf, newId })).toEqual([]);
  });
});
