import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { z } from 'zod';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { SCALE_NO_WEIGHT_MIGRATION } from '../../src/store/migrations/scale-no-weight';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';

const NOW = '2026-11-07T00:00:00.000Z';
const DEVICE = '00000000-0000-4000-8000-0000000000d1';
const ROW = z.object({ id: z.string(), weight_kg: z.number().nullable() });

let database: DatabaseSync;

beforeEach(() => {
  database = new DatabaseSync(':memory:');
  migrate(
    new Sql(database),
    MIGRATIONS.filter((migration) => migration.version < SCALE_NO_WEIGHT_MIGRATION.version),
    NOW,
    testLogger(),
  );
  database
    .prepare(
      `insert into devices (id, provider, external_id, kind, name, model, manufacturer, online,
         capabilities, details, created_at, updated_at)
       values (?, 'local', 'xiaomi_scale:AA', 'other', 'Scale', 'm', 'xiaomi', 1, '[]', '{}', ?, ?)`,
    )
    .run(DEVICE, NOW, NOW);
});

afterEach(() => {
  database.close();
});

function insertReading(id: string, weightKg: number, attribution: string): void {
  database
    .prepare(
      `insert into body_readings (id, device_id, measured_at, weight_kg, attribution, created_at,
         updated_at) values (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, DEVICE, `2026-11-0${id}T02:21:31.000Z`, weightKg, attribution, NOW, NOW);
}

it('clears the no-weight marker the scale sent from weigh-ins nobody counted', () => {
  insertReading('1', 204.7, 'pending');
  insertReading('2', 204.7, 'ignored');
  insertReading('3', 89.3, 'pending');
  migrate(new Sql(database), MIGRATIONS, NOW, testLogger());
  const rows = database
    .prepare('select id, weight_kg from body_readings order by id')
    .all()
    .map((row) => ROW.parse(row));
  expect(rows).toEqual([
    { id: '1', weight_kg: null },
    { id: '2', weight_kg: null },
    { id: '3', weight_kg: 89.3 },
  ]);
});
