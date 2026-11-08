import { DatabaseSync } from 'node:sqlite';
import {
  ApiError,
  HOME_MAP_FLOOR_ID,
  HOME_MAP_MAP_ID,
  type HomeMapId,
  type HomeMapOp,
  type HomeMapPlacement,
} from '@smarteverything/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { HomeMapSet } from '../../src/home-map/map-set';
import { HomeMapService } from '../../src/home-map/service';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { HomeMapsRepository } from '../../src/store/repositories/home-maps';
import { Sql } from '../../src/store/sql';
import { captureLogs, testLogger, type CapturedLogs } from '../support/logs';

const NOW = '2026-10-25T10:00:00.000Z';
const ALICE = 'profile:alice';
const BOB = 'profile:bob';
const LAMP = '3f2b8f9a-6d3c-4d6e-8d4e-0a1b2c3d4e5f';
const MAIN = HOME_MAP_MAP_ID.parse('home');
const ROBOT = '9c1d7e52-1a0b-4f3e-9b6a-2d8e4c7f1a30';

let logs: CapturedLogs;
let repository: HomeMapsRepository;
let service: HomeMapService;
let maps: HomeMapSet;
let removedScans: HomeMapId[];
let scanStillStored: boolean[];
let scanFails: boolean;

const floor = (id: string): Record<string, unknown> => ({
  id,
  name: id,
  level: 0,
  elevation: 0,
  ceilingHeight: 2.6,
  rooms: [],
  walls: [],
  openings: [],
  objects: [],
  placements: [],
  annotations: [],
});

const sofa = (id: string, floorId = 'ground'): HomeMapOp => ({
  op: 'add',
  kind: 'object',
  floorId,
  element: {
    id,
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

const source = (id: string, robotMapId: number, floorId = 'ground'): HomeMapOp => ({
  op: 'add',
  kind: 'source',
  element: {
    id,
    kind: 'xiaomi_vacuum',
    deviceId: ROBOT,
    robotMapId,
    robotMapName: `Robot ${String(robotMapId)}`,
    floorId,
    transform: { rotationDeg: 0, tx: 0, ty: 0, mirrored: false },
    frame: { uid: null, name: 'Map', boundsSignature: 'sig' },
    lastVersion: null,
    lastImportedAt: null,
    base: { rooms: [], walls: [], openings: [] },
    tombstones: [],
  },
});

const placement = (floorId = 'ground'): HomeMapPlacement => ({
  deviceId: LAMP,
  floorId: HOME_MAP_FLOOR_ID.parse(floorId),
  at: { x: 1, y: 1 },
  rotation: 0,
  height: 1,
  tilt: 0,
  mount: 'floor',
  auto: false,
  camera: null,
});

const objectsOf = (mapId?: HomeMapId): string[] =>
  service.get(mapId).floors.flatMap((entry) => entry.objects.map((object) => object.id));

const placedOn = (mapId: HomeMapId): string[] =>
  service.get(mapId).floors.flatMap((entry) => entry.placements.map((item) => item.floorId));

function setup(): HomeMapId {
  service.apply([{ op: 'addFloor', floor: floor('ground') }], 'profile:setup');
  const created = maps.create('Upstairs', ALICE);
  service.apply([{ op: 'addFloor', floor: floor('ground') }], 'profile:setup', {}, created.id);
  return created.id;
}

beforeEach(() => {
  logs = captureLogs();
  removedScans = [];
  scanStillStored = [];
  scanFails = false;
  const database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const sql = new Sql(database);
  migrate(sql, MIGRATIONS, NOW, testLogger());
  const context = new StoreContext(sql, new ChangeFeed(testLogger('store')), () => new Date(NOW));
  repository = new HomeMapsRepository(context, () => undefined);
  service = new HomeMapService({
    maps: repository,
    knownModel: (): boolean => true,
    log: testLogger('home-map'),
  });
  maps = new HomeMapSet({
    sets: repository,
    maps: service,
    removeScan: (mapId): void => {
      scanStillStored.push(repository.stored(mapId) !== null);
      removedScans.push(mapId);
      if (scanFails) throw new Error('disk gone');
    },
    log: testLogger('home-map'),
  });
});

describe('two maps edited independently', () => {
  it('keeps each map with its own revision, content and base revision check', () => {
    const upstairs = setup();
    service.edit({ baseRevision: 1, ops: [sofa('down')] }, ALICE);
    service.edit({ baseRevision: 1, ops: [sofa('up1'), sofa('up2')] }, ALICE, upstairs);
    expect(objectsOf()).toEqual(['down']);
    expect(objectsOf(upstairs)).toEqual(['up1', 'up2']);
    expect(service.revision()).toBe(2);
    expect(service.revision(upstairs)).toBe(3);
    expect(() => service.edit({ baseRevision: 4, ops: [sofa('x')] }, ALICE, upstairs)).toThrow(
      ApiError,
    );
    expect(() => service.get(HOME_MAP_MAP_ID.parse('nothing'))).toThrow(ApiError);
  });

  it('lists the revision log of one map only', () => {
    const upstairs = setup();
    service.edit({ baseRevision: 1, ops: [sofa('down')] }, ALICE);
    service.edit({ baseRevision: 1, ops: [sofa('up')] }, BOB, upstairs);
    expect(service.revisions({ mapId: upstairs }).map((entry) => entry.actor)).toEqual([
      ALICE,
      'profile:setup',
      BOB,
    ]);
    expect(service.revisions().map((entry) => entry.actor)).toEqual(['profile:setup', ALICE]);
  });
});

describe('undo and redo per actor per map', () => {
  it('undoes the callers change on the named map and leaves the other map and other actors alone', () => {
    const upstairs = setup();
    service.edit({ baseRevision: 1, ops: [sofa('a-down')] }, ALICE);
    service.edit({ baseRevision: 1, ops: [sofa('a-up')] }, ALICE, upstairs);
    service.edit({ baseRevision: 2, ops: [sofa('b-down')] }, BOB);
    service.edit({ baseRevision: 2, ops: [sofa('b-up')] }, BOB, upstairs);
    service.undo(ALICE, upstairs);
    expect(objectsOf(upstairs)).toEqual(['b-up']);
    expect(objectsOf()).toEqual(['a-down', 'b-down']);
    service.undo(ALICE);
    expect(objectsOf()).toEqual(['b-down']);
    expect(service.undo(ALICE, upstairs).conflicts).toEqual([]);
    expect(objectsOf(upstairs)).toEqual(['b-up']);
    service.redo(ALICE, upstairs);
    expect(objectsOf(upstairs)).toEqual(['a-up', 'b-up']);
    expect(objectsOf()).toEqual(['b-down']);
  });

  it('rebuilds each maps history from its own log after a restart', () => {
    const upstairs = setup();
    service.edit({ baseRevision: 1, ops: [sofa('down')] }, ALICE);
    service.edit({ baseRevision: 1, ops: [sofa('up')] }, ALICE, upstairs);
    const restarted = new HomeMapService({
      maps: repository,
      knownModel: (): boolean => true,
      log: testLogger('home-map'),
    });
    restarted.undo(ALICE, upstairs);
    expect(restarted.get(upstairs).floors[0]?.objects).toEqual([]);
    expect(restarted.get().floors[0]?.objects).toHaveLength(1);
  });
});

describe('the default map and the map set', () => {
  it('sends calls without a map id to the default map and follows the default when it moves', () => {
    const upstairs = setup();
    service.edit({ baseRevision: 1, ops: [sofa('first')] }, ALICE);
    maps.update(upstairs, { isDefault: true }, ALICE);
    service.edit({ baseRevision: 1, ops: [sofa('second')] }, ALICE);
    expect(objectsOf(upstairs)).toEqual(['second']);
    expect(objectsOf(MAIN)).toEqual(['first']);
    expect(service.get().id).toBe(upstairs);
    service.undo(ALICE);
    expect(objectsOf(upstairs)).toEqual([]);
  });

  it('creates, renames and reorders maps with one default', () => {
    const upstairs = setup();
    const renamed = maps.update(upstairs, { name: 'Loft', position: 0 }, ALICE);
    expect(renamed.name).toBe('Loft');
    expect(maps.list().map((entry) => [entry.name, entry.isDefault])).toEqual([
      ['Loft', false],
      ['Home', true],
    ]);
  });

  it('refuses to remove a map that does not exist', () => {
    expect(() => {
      maps.remove(HOME_MAP_MAP_ID.parse('nothing'));
    }).toThrow(ApiError);
    expect(removedScans).toEqual([]);
  });
});

describe('deleting a map', () => {
  it('moves the default to the first remaining map', () => {
    const upstairs = setup();
    maps.remove(MAIN);
    expect(maps.list().map((entry) => [entry.id, entry.isDefault])).toEqual([[upstairs, true]]);
    expect(service.get().id).toBe(upstairs);
  });

  it('frees the robot maps that fed it so another map can take them', () => {
    const upstairs = setup();
    service.apply([source('s1', 3)], 'profile:setup');
    expect(() => service.apply([source('s2', 3)], 'profile:setup', {}, upstairs)).toThrow(ApiError);
    maps.remove(MAIN);
    service.apply([source('s2', 3)], 'profile:setup', {}, upstairs);
    expect(repository.sourceLocations(ROBOT).map((entry) => entry.mapId)).toEqual([upstairs]);
  });

  it('removes the placements with the map and keeps the other maps and their placements', () => {
    const upstairs = setup();
    maps.placeDevice(placement(), MAIN, ALICE);
    maps.remove(MAIN);
    expect(() => service.get(MAIN)).toThrow(ApiError);
    expect(placedOn(upstairs)).toEqual([]);
    expect(repository.ids()).toEqual([upstairs]);
  });

  it('deletes the scan file only after the row is gone and logs a failure without undoing the delete', () => {
    const upstairs = setup();
    maps.remove(upstairs);
    expect(removedScans).toEqual([upstairs]);
    expect(scanStillStored).toEqual([false]);
    scanFails = true;
    expect(() => {
      maps.remove(MAIN);
    }).not.toThrow();
    expect(repository.ids()).toEqual([]);
    expect(logs.records.some((record) => record.event === 'home_map.scan_removal_failed')).toBe(
      true,
    );
  });

  it('starts a clean history when a map with the same id is created again', () => {
    expect(maps.list()).toEqual([]);
    service.apply([{ op: 'addFloor', floor: floor('ground') }], ALICE);
    service.edit({ baseRevision: 1, ops: [sofa('old')] }, ALICE);
    service.undo(ALICE);
    maps.remove(MAIN);
    service.apply([{ op: 'addFloor', floor: floor('ground') }], ALICE);
    service.edit({ baseRevision: 1, ops: [sofa('new')] }, ALICE);
    service.undo(ALICE);
    expect(objectsOf()).toEqual([]);
    service.redo(ALICE);
    expect(objectsOf()).toEqual(['new']);
  });
});

describe('one device on one map', () => {
  it('moves the placement to another map and makes one revision on each map', () => {
    const upstairs = setup();
    maps.placeDevice(placement(), MAIN, ALICE);
    const before = [service.revision(MAIN), service.revision(upstairs)];
    maps.placeDevice(placement(), upstairs, ALICE);
    expect(placedOn(MAIN)).toEqual([]);
    expect(placedOn(upstairs)).toEqual(['ground']);
    expect(service.revision(upstairs)).toBe((before[1] ?? 0) + 1);
    expect(service.revision(MAIN)).toBe((before[0] ?? 0) + 1);
  });

  it('moves the placement to another floor of the same map in one revision', () => {
    const upstairs = setup();
    service.apply([{ op: 'addFloor', floor: floor('attic') }], 'profile:setup', {}, upstairs);
    maps.placeDevice(placement(), upstairs, ALICE);
    const before = service.revision(upstairs);
    maps.placeDevice(placement('attic'), upstairs, ALICE);
    expect(placedOn(upstairs)).toEqual(['attic']);
    expect(service.revision(upstairs)).toBe(before + 1);
  });

  it('refuses a floor that is not on the map and leaves the old placement', () => {
    const upstairs = setup();
    maps.placeDevice(placement(), MAIN, ALICE);
    expect(() => maps.placeDevice(placement('cellar'), upstairs, ALICE)).toThrow(ApiError);
    expect(placedOn(MAIN)).toEqual(['ground']);
    expect(placedOn(upstairs)).toEqual([]);
  });
});
