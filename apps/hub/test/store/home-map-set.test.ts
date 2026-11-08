import { DatabaseSync } from 'node:sqlite';
import {
  HOME_MAP_MAP_ID,
  HOME_MAP_VERSION_ID,
  type HomeMapId,
  type HomeMapOp,
  type HomeMapSummaryRow,
  type RowOperation,
} from '@smarteverything/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { HOME_MAP_SET_MIGRATION } from '../../src/store/migrations/home-map-set';
import { HomeMapVersionsRepository } from '../../src/store/repositories/home-map-versions';
import { HomeMapsRepository } from '../../src/store/repositories/home-maps';
import { Sql } from '../../src/store/sql';
import { captureLogs, testLogger } from '../support/logs';

const START = Date.parse('2026-10-25T10:00:00.000Z');
const ALICE = 'profile:alice';
const ROBOT = '3f2b8f9a-6d3c-4d6e-8d4e-0a1b2c3d4e5f';
const OTHER_ROBOT = '9c1d7e52-1a0b-4f3e-9b6a-2d8e4c7f1a30';
const COUNT = z.object({ count: z.number() });
const ROW = z.object({
  position: z.number(),
  is_default: z.number(),
  robot_map_id: z.number().nullable(),
});

interface Published {
  readonly operation: RowOperation;
  readonly summary: HomeMapSummaryRow | null;
  readonly previous: HomeMapSummaryRow | null;
}

let database: DatabaseSync;
let sql: Sql;
let tick = 0;
let maps: HomeMapsRepository;
let versions: HomeMapVersionsRepository;
let published: Published[];

const mapId = (value: string): HomeMapId => HOME_MAP_MAP_ID.parse(value);

const floor = (id: string, rooms: readonly string[] = []): Record<string, unknown> => ({
  id,
  name: `Floor ${id}`,
  level: 0,
  elevation: 0,
  ceilingHeight: 2.6,
  rooms: rooms.map((name) => ({
    id: `room-${name}`,
    name,
    homeRoomId: null,
    polygon: {
      outer: [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
        { x: 3, y: 3 },
        { x: 0, y: 3 },
      ],
      holes: [],
    },
    labelAt: { x: 1, y: 1 },
    colourSlot: 1,
    floorMaterial: { kind: 'tile', variant: null, tint: null },
    wallPaint: null,
    ceilingHeight: null,
    origin: { kind: 'hand' },
  })),
  walls: [],
  openings: [],
  objects: [],
  placements: [],
  annotations: [],
});

const addFloor = (id: string, rooms: readonly string[] = []): HomeMapOp => ({
  op: 'addFloor',
  floor: floor(id, rooms),
});

const source = (
  id: string,
  deviceId: string,
  robotMapId: number | undefined,
  floorId = 'ground',
): HomeMapOp => ({
  op: 'add',
  kind: 'source',
  element: {
    id,
    kind: 'xiaomi_vacuum',
    deviceId,
    ...(robotMapId === undefined
      ? {}
      : { robotMapId, robotMapName: `Robot ${String(robotMapId)}` }),
    floorId,
    transform: { rotationDeg: 0, tx: 0, ty: 0, mirrored: false },
    frame: { uid: null, name: 'Map', boundsSignature: 'sig' },
    lastVersion: null,
    lastImportedAt: null,
    base: { rooms: [], walls: [], openings: [] },
    tombstones: [],
  },
});

function count(table: string, where = '1 = 1'): number {
  return COUNT.parse(
    database.prepare(`select count(*) as count from ${table} where ${where}`).get(),
  ).count;
}

function build(): void {
  captureLogs();
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  sql = new Sql(database);
  migrate(sql, MIGRATIONS, new Date(START).toISOString(), testLogger());
  tick = 0;
  const context = new StoreContext(
    sql,
    new ChangeFeed(testLogger('store')),
    () => new Date(START + tick++ * 1000),
  );
  maps = new HomeMapsRepository(context, (operation, summary, previous) => {
    published.push({ operation, summary, previous });
  });
  versions = new HomeMapVersionsRepository(context);
}

const defaults = (): string[] =>
  maps
    .list()
    .filter((entry) => entry.isDefault)
    .map((e) => e.id);

beforeEach(() => {
  published = [];
  build();
});

describe('the home map set migration', () => {
  it('takes the next free version and is registered once', () => {
    expect(HOME_MAP_SET_MIGRATION.version).toBe(146);
    expect(MIGRATIONS.filter((migration) => migration.version === 146)).toEqual([
      HOME_MAP_SET_MIGRATION,
    ]);
    expect(new Set(MIGRATIONS.map((migration) => migration.version)).size).toBe(MIGRATIONS.length);
  });

  it('keeps an existing home map as the default first map and backfills the robot map index', () => {
    const old = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
    const oldSql = new Sql(old);
    migrate(
      oldSql,
      MIGRATIONS.filter((migration) => migration.version < 146),
      '2026-10-25T10:00:00.000Z',
      testLogger(),
    );
    old
      .prepare(
        `insert into home_maps (id, revision, document, updated_at) values ('home', 4, '{}', 'now')`,
      )
      .run();
    old
      .prepare(
        `insert into home_map_sources (map_id, source_id, kind, device_id, document)
         values ('home', 's1', 'xiaomi_vacuum', ?, ?), ('home', 's2', 'xiaomi_vacuum', ?, '{}')`,
      )
      .run(ROBOT, JSON.stringify({ robotMapId: 7 }), OTHER_ROBOT);
    migrate(oldSql, MIGRATIONS, '2026-10-25T10:00:00.000Z', testLogger());
    expect(
      ROW.parse(
        old.prepare(`select position, is_default, null as robot_map_id from home_maps`).get(),
      ),
    ).toMatchObject({ position: 0, is_default: 1 });
    const robots = old
      .prepare('select robot_map_id from home_map_sources order by source_id')
      .all()
      .map((row) => ROW.pick({ robot_map_id: true }).parse(row).robot_map_id);
    expect(robots).toEqual([7, null]);
    expect(() =>
      old
        .prepare(
          `insert into home_maps (id, revision, document, updated_at, is_default)
           values ('two', 1, '{}', 'now', 1)`,
        )
        .run(),
    ).toThrow();
  });
});

describe('the map set', () => {
  it('still creates the home map as the default on the first edit without a map id', () => {
    maps.apply([addFloor('ground')], ALICE);
    expect(maps.ids()).toEqual(['home']);
    expect(maps.defaultId()).toBe('home');
    expect(maps.summary()).toMatchObject({ id: 'home', position: 0, isDefault: true });
    expect(published[0]?.operation).toBe('INSERT');
  });

  it('creates maps in order, the first one the default, each at revision 1 with a log entry', () => {
    const first = maps.create('Ground', ALICE);
    const second = maps.create('Cabin', ALICE);
    expect(first).toMatchObject({ name: 'Ground', isDefault: true, position: 0, revision: 1 });
    expect(second).toMatchObject({ name: 'Cabin', isDefault: false, position: 1, revision: 1 });
    expect(maps.ids()).toEqual([first.id, second.id]);
    expect(maps.revisions({ mapId: second.id })).toMatchObject([{ revision: 1, ops: [] }]);
    expect(published.map((entry) => entry.operation)).toEqual(['INSERT', 'INSERT']);
    expect(defaults()).toEqual([first.id]);
  });

  it('edits the map it is told to and the default map otherwise, never the others', () => {
    const first = maps.create('Ground', ALICE);
    const second = maps.create('Cabin', ALICE);
    maps.apply([addFloor('a', ['Kitchen', 'Hall'])], ALICE);
    maps.apply([addFloor('b')], ALICE, {}, second.id);
    expect(maps.read(first.id).floors.map((entry) => entry.id)).toEqual(['a']);
    expect(maps.read(second.id).floors.map((entry) => entry.id)).toEqual(['b']);
    expect(maps.revisions({ mapId: first.id }).map((entry) => entry.revision)).toEqual([1, 2]);
    expect(maps.revisions({ mapId: second.id }).map((entry) => entry.revision)).toEqual([1, 2]);
    expect(maps.list()[0]).toMatchObject({ floorNames: ['Floor a'], roomCount: 2 });
  });

  it('refuses to read or edit a map that does not exist', () => {
    maps.create('Ground', ALICE);
    expect(() => maps.read(mapId('nope'))).toThrow('There is no map nope');
    expect(() => maps.apply([addFloor('a')], ALICE, {}, mapId('nope'))).toThrow(
      'There is no map nope',
    );
    expect(maps.remove(mapId('nope'))).toBe(false);
    expect(() => maps.update(mapId('nope'), { name: 'x' }, ALICE)).toThrow('There is no map nope');
  });

  it('renames through an undoable revision and moves the default so exactly one map is default', () => {
    const first = maps.create('Ground', ALICE);
    const second = maps.create('Cabin', ALICE);
    published.length = 0;
    const renamed = maps.update(second.id, { name: 'Lake cabin', isDefault: true }, ALICE);
    expect(renamed).toMatchObject({ name: 'Lake cabin', isDefault: true, revision: 2 });
    expect(defaults()).toEqual([second.id]);
    expect(maps.revisions({ mapId: second.id }).map((entry) => entry.revision)).toEqual([1, 2]);
    const flips = published.filter((entry) => entry.previous?.id === first.id);
    expect(flips).toMatchObject([
      { operation: 'UPDATE', summary: { isDefault: false }, previous: { isDefault: true } },
    ]);
  });

  it('orders the maps with contiguous positions and clamps a position past the end', () => {
    const [a, b, c] = ['A', 'B', 'C'].map((name) => maps.create(name, ALICE));
    maps.update(c?.id ?? mapId('x'), { position: 0 }, ALICE);
    expect(maps.list().map((entry) => [entry.name, entry.position])).toEqual([
      ['C', 0],
      ['A', 1],
      ['B', 2],
    ]);
    maps.update(c?.id ?? mapId('x'), { position: 99 }, ALICE);
    expect(maps.list().map((entry) => entry.name)).toEqual(['A', 'B', 'C']);
    expect(maps.list().map((entry) => entry.position)).toEqual([0, 1, 2]);
    expect(a?.id).toBeDefined();
    expect(b?.id).toBeDefined();
  });

  it('deletes a map with its history, sources and versions, moves the default and publishes', () => {
    const first = maps.create('Ground', ALICE);
    const second = maps.create('Cabin', ALICE);
    maps.apply([addFloor('ground'), source('s1', ROBOT, 3)], ALICE, {}, first.id);
    versions.save(first.id, maps.read(first.id), 'before', ALICE);
    published.length = 0;
    expect(maps.remove(first.id)).toBe(true);
    expect(maps.ids()).toEqual([second.id]);
    expect(maps.defaultId()).toBe(second.id);
    expect(maps.list()[0]).toMatchObject({ isDefault: true, position: 0 });
    expect(count('home_map_revisions', `map_id = '${first.id}'`)).toBe(0);
    expect(count('home_map_sources')).toBe(0);
    expect(count('home_map_versions')).toBe(0);
    expect(published.map((entry) => entry.operation)).toEqual(['DELETE', 'UPDATE']);
    expect(published[0]).toMatchObject({ summary: null, previous: { id: first.id } });
  });

  it('is the empty state when the last map goes, and the next edit starts a fresh home map', () => {
    const only = maps.create('Ground', ALICE);
    expect(maps.remove(only.id)).toBe(true);
    expect(maps.ids()).toEqual([]);
    expect(maps.defaultId()).toBeNull();
    expect(maps.summary()).toBeNull();
    maps.apply([addFloor('ground')], ALICE);
    expect(maps.defaultId()).toBe('home');
  });
});

describe('one source per robot map', () => {
  it('refuses a second map that takes the same robot map of a device and rolls the edit back', () => {
    const first = maps.create('Ground', ALICE);
    const second = maps.create('Cabin', ALICE);
    maps.apply([addFloor('ground'), source('s1', ROBOT, 3)], ALICE, {}, first.id);
    maps.apply([addFloor('ground')], ALICE, {}, second.id);
    expect(() => maps.apply([source('s2', ROBOT, 3)], ALICE, {}, second.id)).toThrow(
      `already feeds the map ${first.id}`,
    );
    expect(maps.read(second.id).sources).toEqual([]);
    expect(maps.revisions({ mapId: second.id })).toHaveLength(2);
  });

  it('allows other robot maps of the same device, other devices, and frees the key on removal', () => {
    const first = maps.create('Ground', ALICE);
    const second = maps.create('Cabin', ALICE);
    maps.apply([addFloor('ground'), source('s1', ROBOT, 3)], ALICE, {}, first.id);
    maps.apply([addFloor('ground'), source('s2', ROBOT, 4)], ALICE, {}, second.id);
    maps.apply([source('s3', OTHER_ROBOT, 9)], ALICE, {}, second.id);
    expect(
      maps.sourceLocations(ROBOT).map((entry) => [entry.mapId, entry.source.robotMapId]),
    ).toEqual(
      [
        [first.id, 3],
        [second.id, 4],
      ].sort((x, y) => String(x[0]).localeCompare(String(y[0]))),
    );
    maps.apply([{ op: 'remove', kind: 'source', id: 's1' }], ALICE, {}, first.id);
    maps.apply([{ op: 'remove', kind: 'source', id: 's2' }], ALICE, {}, second.id);
    maps.apply([source('s4', ROBOT, 3)], ALICE, {}, second.id);
    expect(maps.sourcesOfDevice(ROBOT, second.id).map((entry) => entry.id)).toEqual(['s4']);
    expect(maps.list()[1]?.fedBy).toEqual(['Robot 9', 'Robot 3']);
  });

  it('refuses a floor that gets two sources from one device', () => {
    const only = maps.create('Ground', ALICE);
    maps.apply([addFloor('ground'), source('s1', ROBOT, 1)], ALICE, {}, only.id);
    expect(() => maps.apply([source('s2', ROBOT, 2)], ALICE, {}, only.id)).toThrow(
      'already has a source from that device',
    );
    expect(maps.read(only.id).sources).toHaveLength(1);
  });
});

describe('saved versions', () => {
  it('saves whole documents without any cap, newest first, and reads them back', () => {
    const only = maps.create('Ground', ALICE);
    maps.apply([addFloor('ground')], ALICE, {}, only.id);
    const saved = Array.from({ length: 30 }, (_, index) =>
      versions.save(only.id, maps.read(only.id), index === 0 ? null : `v${String(index)}`, ALICE),
    );
    const listed = versions.list(only.id);
    expect(listed).toHaveLength(30);
    expect(listed[0]?.versionId).toBe(saved[29]?.versionId);
    expect(listed.at(-1)?.name).toBeNull();
    const snapshot = versions.read(only.id, saved[3]?.versionId ?? HOME_MAP_VERSION_ID.parse('x'));
    expect(snapshot?.version).toMatchObject({ mapId: only.id, name: 'v3', actor: ALICE });
    expect(snapshot?.document.floors.map((entry) => entry.id)).toEqual(['ground']);
  });

  it('keeps a version after the map changes and removes one version on request', () => {
    const only = maps.create('Ground', ALICE);
    const kept = versions.save(only.id, maps.read(only.id), 'empty', ALICE);
    maps.apply([addFloor('ground')], ALICE, {}, only.id);
    expect(versions.read(only.id, kept.versionId)?.document.floors).toEqual([]);
    expect(versions.remove(only.id, kept.versionId)).toBe(true);
    expect(versions.remove(only.id, kept.versionId)).toBe(false);
    expect(versions.read(only.id, kept.versionId)).toBeNull();
  });
});
