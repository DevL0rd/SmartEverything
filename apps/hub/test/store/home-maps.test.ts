import { DatabaseSync } from 'node:sqlite';
import type { HomeMapOp, HomeMapSummaryRow, RowOperation } from '@smarteverything/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { HOME_MAP_MIGRATION } from '../../src/store/migrations/home-map';
import { HomeMapsRepository, type HomeMapPublisher } from '../../src/store/repositories/home-maps';
import { Sql } from '../../src/store/sql';
import { captureLogs, testLogger } from '../support/logs';

const NOW = '2026-10-25T10:00:00.000Z';
const ROBOT = '3f2b8f9a-6d3c-4d6e-8d4e-0a1b2c3d4e5f';
const OTHER_ROBOT = '9c1d7e52-1a0b-4f3e-9b6a-2d8e4c7f1a30';
const ALICE = 'profile:alice';
const BOB = 'profile:bob';
const COUNT = z.object({ count: z.number() });
const SCAN = {
  file: { hash: 'a'.repeat(64), format: 'ply', bytes: 1024, name: 'living.ply' },
  lod: null,
  transform: { tx: 0, ty: 0, tz: 0, yawDeg: 0, scale: 1, levelled: true },
  opacity: 0.8,
  points: [],
  residualM: null,
  uploadedAt: NOW,
  uploadedBy: ALICE,
};
const NAMES = z.object({ name: z.string() });

interface Published {
  readonly operation: RowOperation;
  readonly summary: HomeMapSummaryRow | null;
  readonly previous: HomeMapSummaryRow | null;
}

let database: DatabaseSync;
let sql: Sql;
let repository: HomeMapsRepository;
let published: Published[];

const floor = (id: string, level: number): Record<string, unknown> => ({
  id,
  name: id,
  level,
  elevation: level * 2.7,
  ceilingHeight: 2.6,
  rooms: [],
  walls: [],
  openings: [],
  objects: [],
  placements: [],
  annotations: [],
});

const addFloor = (id: string, level = 0): HomeMapOp => ({
  op: 'addFloor',
  floor: floor(id, level),
});

const source = (id: string, deviceId: string): Record<string, unknown> => ({
  id,
  kind: 'xiaomi_vacuum',
  deviceId,
  floorId: 'ground',
  transform: { rotationDeg: 0, tx: 0, ty: 0, mirrored: false },
  frame: { uid: null, name: 'Map', boundsSignature: 'sig' },
  lastVersion: null,
  lastImportedAt: null,
  base: { rooms: [], walls: [], openings: [] },
  tombstones: [],
});

const addSource = (id: string, deviceId: string): HomeMapOp => ({
  op: 'add',
  kind: 'source',
  element: source(id, deviceId),
});

function count(table: string): number {
  return COUNT.parse(database.prepare(`select count(*) as count from ${table}`).get()).count;
}

function build(publish: HomeMapPublisher): void {
  captureLogs();
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  sql = new Sql(database);
  migrate(sql, MIGRATIONS, NOW, testLogger());
  const context = new StoreContext(sql, new ChangeFeed(testLogger('store')), () => new Date(NOW));
  repository = new HomeMapsRepository(context, publish);
}

beforeEach(() => {
  published = [];
  build((operation, summary, previous): void => {
    published.push({ operation, summary, previous });
  });
});

describe('the home map migration', () => {
  it('takes one free version and is part of the latest migrations', () => {
    expect(HOME_MAP_MIGRATION.version).toBe(144);
    expect(new Set(MIGRATIONS.map((migration) => migration.version)).size).toBe(MIGRATIONS.length);
    expect(MIGRATIONS).toContain(HOME_MAP_MIGRATION);
  });

  it('only adds tables and leaves the existing data alone', () => {
    const before = MIGRATIONS.filter((migration) => migration.version < HOME_MAP_MIGRATION.version);
    const old = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
    const oldSql = new Sql(old);
    migrate(oldSql, before, NOW, testLogger());
    old.prepare(`insert into rooms (id, name, position) values ('kitchen', 'Kitchen', 0)`).run();
    migrate(oldSql, MIGRATIONS, NOW, testLogger());
    expect(NAMES.parse(old.prepare('select name from rooms').get()).name).toBe('Kitchen');
    const tables = old
      .prepare(`select name from sqlite_master where name like 'home_map%' and type = 'table'`)
      .all();
    expect(tables.map((row) => NAMES.parse(row).name).sort()).toEqual([
      'home_map_revisions',
      'home_map_sources',
      'home_map_versions',
      'home_maps',
    ]);
  });

  it('refuses a document that is not json and an actor that is not an actor', () => {
    expect(() =>
      database
        .prepare(
          `insert into home_maps (id, revision, document, updated_at) values ('home', 1, 'x', ?)`,
        )
        .run(NOW),
    ).toThrow();
    database
      .prepare(
        `insert into home_maps (id, revision, document, updated_at) values ('home', 1, '{}', ?)`,
      )
      .run(NOW);
    expect(() =>
      database
        .prepare(
          `insert into home_map_revisions (map_id, revision, ops, inverse, actor, at)
           values ('home', 1, '[]', '[]', 'someone', ?)`,
        )
        .run(NOW),
    ).toThrow();
  });
});

describe('the home map repository', () => {
  it('reads an empty map at revision zero without storing it', () => {
    expect(repository.stored()).toBeNull();
    expect(repository.summary()).toBeNull();
    expect(repository.read()).toMatchObject({ id: 'home', revision: 0, floors: [] });
    expect(count('home_maps')).toBe(0);
  });

  it('stores the first accepted batch as revision 1 and publishes only a summary row', () => {
    const result = repository.apply([addFloor('ground'), addFloor('upstairs', 1)], ALICE);
    expect(result.revision).toBe(1);
    expect(result.conflicts).toEqual([]);
    expect(repository.read().floors.map((entry) => entry.id)).toEqual(['ground', 'upstairs']);
    expect(published).toEqual([
      {
        operation: 'INSERT',
        previous: null,
        summary: {
          id: 'home',
          revision: 1,
          name: 'Home',
          floors: 2,
          position: 0,
          isDefault: true,
          fedBy: [],
          hasScan: false,
          updatedAt: NOW,
        },
      },
    ]);
    expect(Object.keys(published[0]?.summary ?? {}).sort()).toEqual([
      'fedBy',
      'floors',
      'hasScan',
      'id',
      'isDefault',
      'name',
      'position',
      'revision',
      'updatedAt',
    ]);
  });

  it('reports a stored scan in the published summary row and in the list entry', () => {
    repository.apply([addFloor('ground')], ALICE);
    expect(published[0]?.summary?.hasScan).toBe(false);
    expect(repository.list().map((entry) => entry.hasScan)).toEqual([false]);
    repository.apply([{ op: 'setScan', scan: SCAN }], ALICE);
    expect(published[1]?.summary?.hasScan).toBe(true);
    expect(published[1]?.previous?.hasScan).toBe(false);
    expect(repository.summary()?.hasScan).toBe(true);
    expect(repository.list().map((entry) => entry.hasScan)).toEqual([true]);
    repository.apply([{ op: 'removeScan' }], ALICE);
    expect(repository.summary()?.hasScan).toBe(false);
    expect(repository.list().map((entry) => entry.hasScan)).toEqual([false]);
  });

  it('publishes an update with the previous summary and one revision per batch', () => {
    repository.apply([addFloor('ground')], ALICE);
    repository.apply([addFloor('upstairs', 1), { op: 'setMap', patch: { name: 'House' } }], BOB);
    expect(published.map((entry) => entry.operation)).toEqual(['INSERT', 'UPDATE']);
    expect(published[1]?.previous).toMatchObject({ revision: 1, name: 'Home', floors: 1 });
    expect(published[1]?.summary).toMatchObject({ revision: 2, name: 'House', floors: 2 });
    expect(count('home_maps')).toBe(1);
    expect(count('home_map_revisions')).toBe(2);
  });

  it('makes no revision, no log row and no publication when nothing applied', () => {
    repository.apply([addFloor('ground')], ALICE);
    published.length = 0;
    const result = repository.apply(
      [{ op: 'remove', kind: 'room', floorId: 'ground', id: 'gone' }, addFloor('ground')],
      BOB,
    );
    expect(result.revision).toBe(1);
    expect(result.applied).toEqual([]);
    expect(result.conflicts.map((conflict) => conflict.reason).sort()).toEqual([
      'exists',
      'missing_element',
    ]);
    expect(published).toEqual([]);
    expect(count('home_map_revisions')).toBe(1);
  });

  it('does not store a map when the very first batch only conflicts', () => {
    const result = repository.apply([{ op: 'removeFloor', floorId: 'nothing' }], ALICE);
    expect(result.revision).toBe(0);
    expect(count('home_maps')).toBe(0);
    expect(published).toEqual([]);
  });

  it('logs applied ops and inverse per actor without any cap, and the inverse restores the map', () => {
    for (let index = 0; index < 60; index++) {
      repository.apply([addFloor(`floor-${String(index)}`, index)], index % 3 === 0 ? ALICE : BOB);
    }
    const all = repository.revisions();
    expect(all).toHaveLength(60);
    expect(all.map((entry) => entry.revision)).toEqual(Array.from({ length: 60 }, (_, i) => i + 1));
    expect(repository.revisions({ actor: ALICE })).toHaveLength(20);
    expect(repository.revisions({ actor: BOB, after: 50 }).map((entry) => entry.revision)).toEqual([
      51, 53, 54, 56, 57, 59, 60,
    ]);
    const before = repository.read();
    repository.apply([{ op: 'setFloor', floorId: 'floor-3', patch: { name: 'Attic' } }], BOB);
    const entry = repository.revisions({ after: 60 })[0];
    expect(entry?.actor).toBe(BOB);
    expect(repository.read().floors.find((candidate) => candidate.id === 'floor-3')?.name).toBe(
      'Attic',
    );
    repository.apply(entry?.inverse ?? [], BOB);
    expect(repository.read().floors).toEqual(before.floors);
  });

  it('keeps an index of the sources by device in step with the document', () => {
    repository.apply([addFloor('ground')], ALICE);
    repository.apply(
      [addSource('robot-1', ROBOT), addSource('robot-2', OTHER_ROBOT)],
      'source:robot-1',
    );
    expect(repository.sourcesOfDevice(ROBOT).map((entry) => entry.id)).toEqual(['robot-1']);
    expect(repository.sourcesOfDevice(OTHER_ROBOT)).toHaveLength(1);
    repository.apply([{ op: 'remove', kind: 'source', id: 'robot-1' }], ALICE);
    expect(repository.sourcesOfDevice(ROBOT)).toEqual([]);
    expect(count('home_map_sources')).toBe(1);
    expect(repository.read().sources.map((entry) => entry.id)).toEqual(['robot-2']);
  });

  it('keeps fields it does not know when it rewrites a document from a newer build', () => {
    const future = {
      ...repository.read(),
      revision: 7,
      future: { sky: true },
      floors: [{ ...floor('ground', 0), skylight: 'wide' }],
    };
    database
      .prepare(
        `insert into home_maps (id, revision, document, updated_at, is_default) values ('home', 7, ?, ?, 1)`,
      )
      .run(JSON.stringify(future), NOW);
    const result = repository.apply([addFloor('upstairs', 1)], ALICE);
    expect(result.revision).toBe(8);
    expect(repository.read()).toMatchObject({
      future: { sky: true },
      floors: [{ id: 'ground', skylight: 'wide' }, { id: 'upstairs' }],
    });
    expect(published[0]?.operation).toBe('UPDATE');
  });

  it('rolls the whole batch back when publication fails', () => {
    build(() => {
      throw new Error('feed down');
    });
    expect(() => repository.apply([addFloor('ground')], ALICE)).toThrow('feed down');
    expect(count('home_maps')).toBe(0);
    expect(count('home_map_revisions')).toBe(0);
    expect(count('home_map_sources')).toBe(0);
  });
});
