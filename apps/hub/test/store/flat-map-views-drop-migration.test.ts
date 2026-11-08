import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { FLAT_MAP_VIEWS_DROP_MIGRATION } from '../../src/store/migrations/flat-map-views-drop';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';

const NOW = '2026-11-03T05:00:00.000Z';
const ROWS = z.array(z.object({ owner: z.string(), page: z.string(), layout: z.string() }));

const pref = (version: number, view: Record<string, string>): unknown => ({
  version,
  value: { view, pinnedSize: 0.4, pinnedCollapsed: false, lastFloor: 'f1' },
});

const board = (vacuumView?: string): unknown => ({
  version: 2,
  classes: Object.fromEntries(
    ['compact', 'medium', 'expanded'].map((name) => [
      name,
      {
        widgets: [
          {
            key: 'spotlight',
            type: 'spotlight',
            size: 'M',
            options: { deviceId: 'd1', ...(vacuumView === undefined ? {} : { vacuumView }) },
          },
          { key: 'steps', type: 'steps', size: 'S' },
        ],
      },
    ]),
  ),
});

const SEEDED: readonly (readonly [string, string, unknown])[] = [
  ['c1', 'home-map-view', pref(1, { home: 'map', devices: '3d', room: 'realistic' })],
  ['c2', 'home-map-view', pref(1, { home: 'map' })],
  ['c3', 'home-map-view', pref(2, { home: 'realistic' })],
  ['c4', 'home-map-view', { version: 1, value: { view: 'nope' } }],
  ['c1', 'home', board('2d')],
  ['c2', 'devices', board('3d')],
  ['c3', 'fitness', { goals: { steps: 9000 } }],
];

const DROPPED: readonly (readonly [string, string, unknown])[] = [
  ['c1', 'home-map-view', pref(2, { home: '3d', devices: '3d', room: 'realistic' })],
  ['c2', 'home-map-view', pref(2, { home: '3d' })],
  ['c3', 'home-map-view', pref(2, { home: 'realistic' })],
  ['c4', 'home-map-view', { version: 1, value: { view: 'nope' } }],
  ['c1', 'home', board()],
  ['c2', 'devices', board('3d')],
  ['c3', 'fitness', { goals: { steps: 9000 } }],
];

let database: DatabaseSync;

beforeEach(() => {
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  migrate(
    new Sql(database),
    MIGRATIONS.filter((migration) => migration.version < FLAT_MAP_VIEWS_DROP_MIGRATION.version),
    NOW,
    testLogger(),
  );
  for (const id of ['c1', 'c2', 'c3', 'c4'])
    database
      .prepare(
        "insert into clients (id, name, platform, role, built_in, token_hash, created_at) values (?, ?, 'android', 'owner', 0, ?, ?)",
      )
      .run(id, id, `hash-${id}`, NOW);
  for (const [client, page, layout] of SEEDED)
    database
      .prepare(
        'insert into layouts (client_id, profile_id, page, layout, updated_at) values (?, null, ?, ?, ?)',
      )
      .run(client, page, JSON.stringify(layout), NOW);
});

afterEach(() => {
  database.close();
});

function stored(): readonly (readonly [string, string, unknown])[] {
  return ROWS.parse(
    database.prepare('select client_id as owner, page, layout from layouts order by rowid').all(),
  ).map((row) => [row.owner, row.page, JSON.parse(row.layout)] as const);
}

function run(): void {
  migrate(new Sql(database), MIGRATIONS, NOW, testLogger());
}

describe('dropping the flat map views from stored layouts', () => {
  it('moves map to 3d in every client view pref and removes the 2d vacuum option', () => {
    run();

    expect(stored()).toStrictEqual(DROPPED);
  });

  it('changes nothing when run on the migrated data again', () => {
    run();
    const first = stored();
    new Sql(database).transaction(() =>
      FLAT_MAP_VIEWS_DROP_MIGRATION.backfill?.(new Sql(database), NOW),
    );

    expect(stored()).toStrictEqual(first);
  });
});
