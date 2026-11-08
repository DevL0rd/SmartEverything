import { DatabaseSync } from 'node:sqlite';
import {
  ApiError,
  HOME_MAP_FLOOR_ID,
  HOME_MAP_MAP_ID,
  HOME_MAP_VERSION_ID,
  type HomeMap,
  type HomeMapId,
  type HomeMapOp,
  type HomeMapPlacement,
} from '@smarteverything/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { HomeMapService } from '../../src/home-map/service';
import { HomeMapVersions } from '../../src/home-map/versions';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { HomeMapVersionsRepository } from '../../src/store/repositories/home-map-versions';
import { HomeMapsRepository } from '../../src/store/repositories/home-maps';
import { Sql } from '../../src/store/sql';
import { captureLogs, testLogger, type CapturedLogs } from '../support/logs';

const NOW = '2026-10-25T10:00:00.000Z';
const ALICE = 'profile:alice';
const BOB = 'profile:bob';
const HOME = HOME_MAP_MAP_ID.parse('home');
const LAMP = '3f2b8f9a-6d3c-4d6e-8d4e-0a1b2c3d4e5f';

let logs: CapturedLogs;
let repository: HomeMapsRepository;
let service: HomeMapService;
let versions: HomeMapVersions;

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

const sofa = (id: string): HomeMapOp => ({
  op: 'add',
  kind: 'object',
  floorId: 'ground',
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

const lamp: HomeMapPlacement = {
  deviceId: LAMP,
  floorId: HOME_MAP_FLOOR_ID.parse('ground'),
  at: { x: 1, y: 1 },
  rotation: 0,
  height: 1,
  tilt: 0,
  mount: 'floor',
  auto: false,
  camera: null,
};

const objectIds = (map: HomeMap): string[] =>
  map.floors.flatMap((entry) => entry.objects.map((object) => object.id));

const placedOn = (map: HomeMap): string[] =>
  map.floors.flatMap((entry) => entry.placements.map((item) => item.deviceId));

const withoutRevision = (map: HomeMap): Omit<HomeMap, 'revision' | 'updatedAt'> => {
  const { revision, updatedAt, ...rest } = map;
  expect(revision).toBeGreaterThan(0);
  expect(updatedAt).toBeTypeOf('string');
  return rest;
};

function secondMap(): HomeMapId {
  const created = repository.create('Upstairs', ALICE);
  service.apply([{ op: 'addFloor', floor: floor('ground') }], 'profile:setup', {}, created.id);
  return created.id;
}

beforeEach(() => {
  logs = captureLogs();
  const database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const sql = new Sql(database);
  migrate(sql, MIGRATIONS, NOW, testLogger());
  let tick = 0;
  const context = new StoreContext(
    sql,
    new ChangeFeed(testLogger('store')),
    () => new Date(Date.parse(NOW) + tick++ * 1000),
  );
  repository = new HomeMapsRepository(context, () => undefined);
  service = new HomeMapService({
    maps: repository,
    knownModel: (): boolean => true,
    log: testLogger('home-map'),
  });
  versions = new HomeMapVersions({
    versions: new HomeMapVersionsRepository(context),
    maps: service,
    mapIds: (): HomeMapId[] => repository.ids(),
    log: testLogger('home-map'),
  });
  service.apply([{ op: 'addFloor', floor: floor('ground') }, sofa('first')], 'profile:setup');
});

describe('saved versions', () => {
  it('lists the saved versions of one map newest first with name and author', () => {
    const upstairs = secondMap();
    const named = versions.save(HOME, 'Before the party', ALICE);
    const plain = versions.save(HOME, undefined, BOB);
    versions.save(upstairs, 'Other map', ALICE);
    const listed = versions.list(HOME);
    expect(listed.map((entry) => entry.versionId)).toEqual([plain.versionId, named.versionId]);
    expect(listed.map((entry) => [entry.name, entry.actor])).toEqual([
      [null, BOB],
      ['Before the party', ALICE],
    ]);
    expect(versions.list(upstairs)).toHaveLength(1);
  });

  it('refuses an unknown map and an unknown or foreign version', () => {
    const upstairs = secondMap();
    const saved = versions.save(upstairs, undefined, ALICE);
    expect(() => versions.list(HOME_MAP_MAP_ID.parse('nothing'))).toThrow(ApiError);
    expect(() => versions.restore(HOME, saved.versionId, ALICE)).toThrow(ApiError);
    expect(() => versions.restore(HOME, HOME_MAP_VERSION_ID.parse('nope'), ALICE)).toThrow(
      ApiError,
    );
  });
});

describe('restoring a version', () => {
  it('is one revision, brings the saved state back and one undo returns the edits', () => {
    const saved = versions.save(HOME, 'Tidy', ALICE);
    const tidy = service.get(HOME);
    service.apply(
      [
        sofa('second'),
        { op: 'add', kind: 'placement', floorId: 'ground', element: lamp },
        { op: 'remove', kind: 'object', floorId: 'ground', id: 'first' },
        { op: 'setMap', patch: { name: 'Renamed' } },
      ],
      ALICE,
    );
    const messy = service.get(HOME);
    const answer = versions.restore(HOME, saved.versionId, ALICE);
    expect(answer.revision).toBe(messy.revision + 1);
    expect(answer.conflicts).toEqual([]);
    expect(withoutRevision(service.get(HOME))).toEqual(withoutRevision(tidy));
    service.undo(ALICE, HOME);
    expect(service.revision(HOME)).toBe(answer.revision + 1);
    expect(withoutRevision(service.get(HOME))).toEqual(withoutRevision(messy));
    service.redo(ALICE, HOME);
    expect(withoutRevision(service.get(HOME))).toEqual(withoutRevision(tidy));
  });

  it('restores floors that were removed and removes floors that were added', () => {
    const saved = versions.save(HOME, undefined, ALICE);
    service.apply(
      [
        { op: 'addFloor', floor: floor('attic') },
        { op: 'removeFloor', floorId: 'ground' },
      ],
      ALICE,
    );
    versions.restore(HOME, saved.versionId, ALICE);
    expect(service.get(HOME).floors.map((entry) => entry.id)).toEqual(['ground']);
    expect(objectIds(service.get(HOME))).toEqual(['first']);
  });

  it('writes nothing when the map already equals the version', () => {
    const saved = versions.save(HOME, undefined, ALICE);
    const revision = service.revision(HOME);
    expect(versions.restore(HOME, saved.versionId, ALICE)).toEqual({ revision, conflicts: [] });
    expect(service.revision(HOME)).toBe(revision);
  });

  it('does not place a device on two maps when it moved to another map since', () => {
    const upstairs = secondMap();
    service.apply(
      [{ op: 'add', kind: 'placement', floorId: 'ground', element: lamp }],
      ALICE,
      {},
      HOME,
    );
    const saved = versions.save(HOME, undefined, ALICE);
    service.apply(
      [{ op: 'remove', kind: 'placement', floorId: 'ground', id: LAMP }],
      ALICE,
      {},
      HOME,
    );
    service.apply(
      [{ op: 'add', kind: 'placement', floorId: 'ground', element: lamp }],
      ALICE,
      {},
      upstairs,
    );
    versions.restore(HOME, saved.versionId, ALICE);
    expect(placedOn(service.get(HOME))).toEqual([]);
    expect(placedOn(service.get(upstairs))).toEqual([LAMP]);
    expect(logs.events()).toContain('home_map.restore_kept_placements_elsewhere');
  });
});
