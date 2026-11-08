import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { VACUUM_MIGRATION } from '../../src/store/migrations/vacuum';
import { Sql } from '../../src/store/sql';
import { captureLogs, testLogger } from '../support/logs';

const NOW = '2026-10-24T10:00:00.000Z';
const BEFORE_VACUUM = MIGRATIONS.filter(
  (migration) => migration.version < VACUUM_MIGRATION.version,
);
const THROUGH_VACUUM = MIGRATIONS.filter(
  (migration) => migration.version <= VACUUM_MIGRATION.version,
);
const ROBOT = 'robot';
const SPEAKER = 'speaker';
const OTHER_ROBOT = 'other-robot';

const STATE = z.object({ device_id: z.string(), capability: z.string(), value: z.string() });
const HISTORY = z.object({ device_id: z.string(), capability: z.string() });
const NAME = z.object({ name: z.string() });
const VERSION = z.object({ version: z.number() });

let database: DatabaseSync;
let sql: Sql;

function device(id: string, model: string): void {
  database
    .prepare(
      `insert into devices (id, provider, external_id, kind, name, model, manufacturer, created_at, updated_at)
       values (?, 'xiaomi', ?, 'vacuum', ?, ?, 'Xiaomi', ?, ?)`,
    )
    .run(id, id, id, model, NOW, NOW);
}

function state(deviceId: string, capability: string, value: string): void {
  database
    .prepare(
      'insert into device_state (device_id, capability, value, observed_at) values (?, ?, ?, ?)',
    )
    .run(deviceId, capability, value, NOW);
  database
    .prepare(
      'insert into state_history (device_id, capability, value, observed_at) values (?, ?, ?, ?)',
    )
    .run(deviceId, capability, value, NOW);
}

function stateRows(): z.output<typeof STATE>[] {
  return z
    .array(STATE)
    .parse(
      database
        .prepare(
          'select device_id, capability, value from device_state order by device_id, capability',
        )
        .all(),
    );
}

function historyRows(): z.output<typeof HISTORY>[] {
  return z
    .array(HISTORY)
    .parse(database.prepare('select device_id, capability from state_history order by id').all());
}

beforeEach(() => {
  captureLogs();
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  sql = new Sql(database);
  migrate(sql, BEFORE_VACUUM, NOW, testLogger());
  device(ROBOT, 'xiaomi.vacuum.pv11gl');
  device(OTHER_ROBOT, 'xiaomi.vacuum.pv11gl');
  device(SPEAKER, 'xiaomi.speaker.l05b');
});

describe('the vacuum migration', () => {
  it('takes the next free version and is registered', () => {
    expect(VACUUM_MIGRATION.version).toBe(140);
    expect(MIGRATIONS).toContain(VACUUM_MIGRATION);
    expect(new Set(MIGRATIONS.map((migration) => migration.version)).size).toBe(MIGRATIONS.length);
    migrate(sql, THROUGH_VACUUM, NOW, testLogger());
    const version = VERSION.parse(
      database.prepare('select max(version) as version from schema_version').get(),
    );
    expect(version.version).toBe(VACUUM_MIGRATION.version);
  });

  it('creates both tables', () => {
    migrate(sql, THROUGH_VACUUM, NOW, testLogger());
    const names = z
      .array(NAME)
      .parse(
        database
          .prepare(
            "select name from sqlite_master where name like 'vacuum_%' and type = 'table' order by name",
          )
          .all(),
      );
    expect(names.map((row) => row.name)).toStrictEqual(['vacuum_cleans', 'vacuum_scenes']);
  });

  it('moves the camera switch state and history of the vacuum from power to raw:21.6 only', () => {
    state(ROBOT, 'power', 'true');
    state(ROBOT, 'battery', '80');
    state(SPEAKER, 'power', 'false');
    migrate(sql, MIGRATIONS, NOW, testLogger());
    expect(stateRows()).toStrictEqual([
      { device_id: ROBOT, capability: 'battery', value: '80' },
      { device_id: ROBOT, capability: 'raw:21.6', value: 'true' },
      { device_id: SPEAKER, capability: 'power', value: 'false' },
    ]);
    expect(historyRows()).toStrictEqual([
      { device_id: ROBOT, capability: 'raw:21.6' },
      { device_id: ROBOT, capability: 'battery' },
      { device_id: SPEAKER, capability: 'power' },
    ]);
  });

  it('drops the old power row when the vacuum already has its own camera switch row', () => {
    state(OTHER_ROBOT, 'power', 'true');
    state(OTHER_ROBOT, 'raw:21.6', 'false');
    migrate(sql, MIGRATIONS, NOW, testLogger());
    expect(stateRows()).toStrictEqual([
      { device_id: OTHER_ROBOT, capability: 'raw:21.6', value: 'false' },
    ]);
  });

  it('rejects scene and clean rows that are not JSON of the right shape', () => {
    migrate(sql, MIGRATIONS, NOW, testLogger());
    expect(() =>
      database
        .prepare("insert into vacuum_scenes values (?, 'current', 1, 'nope', ?)")
        .run(ROBOT, NOW),
    ).toThrow();
    expect(() =>
      database
        .prepare("insert into vacuum_scenes values (?, 'current', 1, '[]', ?)")
        .run(ROBOT, NOW),
    ).toThrow();
    expect(() =>
      database
        .prepare("insert into vacuum_scenes values (?, 'elsewhere', 1, '{}', ?)")
        .run(ROBOT, NOW),
    ).toThrow();
    expect(() =>
      database
        .prepare(
          "insert into vacuum_cleans (device_id, id, started_at, seconds, area_m2, rooms, zones, trail) values (?, 'c', ?, 1, 1, '{}', '[]', '[]')",
        )
        .run(ROBOT, NOW),
    ).toThrow();
  });
});
