import { mkdtemp, rm } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { IR_APPLIANCES_MIGRATION } from '../../src/store/migrations/ir-appliances';
import { Sql } from '../../src/store/sql';
import { captureLogs, testLogger } from '../support/logs';

const NOW = '2026-10-25T09:00:00.000Z';
const ROWS = z.array(z.record(z.string(), z.unknown()));

let directory: string;
let database: DatabaseSync;

beforeEach(async () => {
  captureLogs();
  directory = await mkdtemp(join(tmpdir(), 'hub-ir-appliances-'));
  database = new DatabaseSync(join(directory, 'hub.db'), { enableForeignKeyConstraints: true });
  migrate(
    new Sql(database),
    MIGRATIONS.filter((migration) => migration.version <= IR_APPLIANCES_MIGRATION.version),
    NOW,
    testLogger(),
  );
});

afterEach(async () => {
  database.close();
  await rm(directory, { recursive: true, force: true });
});

function run(sql: string, ...values: (string | null)[]): void {
  database.prepare(sql).run(...values);
}

function rows(sql: string): z.output<typeof ROWS> {
  return ROWS.parse(database.prepare(sql).all());
}

function bound(): void {
  run(
    "insert into devices (id, provider, external_id, kind, name, model, manufacturer, details, created_at, updated_at) values ('blaster', 'tuya', 'ir1', 'ir_blaster', 'IR', 'm', 'Tuya', '{}', ?, ?)",
    NOW,
    NOW,
  );
  run(
    "insert into ir_appliances (id, blaster_id, name, category, brand, encoder, created_at) values ('ac', 'blaster', 'Air Conditioner', 'air conditioner', null, 'learned', ?)",
    NOW,
  );
  run(
    "insert into ir_appliance_keys (id, appliance_id, button, format, code, created_at) values ('k1', 'ac', 'Power', 'pulses', 'abc', ?)",
    NOW,
  );
}

describe('the IR appliances tables', () => {
  it('keep an appliance and its buttons with no blaster when the blaster device is removed', () => {
    bound();
    run("delete from devices where id = 'blaster'");
    expect(rows('select id, blaster_id from ir_appliances')).toStrictEqual([
      { id: 'ac', blaster_id: null },
    ]);
    expect(rows('select button from ir_appliance_keys')).toStrictEqual([{ button: 'Power' }]);
  });

  it('remove the buttons with the appliance', () => {
    bound();
    run("delete from ir_appliances where id = 'ac'");
    expect(rows('select id from ir_appliance_keys')).toStrictEqual([]);
  });

  it('refuse a second code for the same button and a code format it cannot send', () => {
    bound();
    expect(() => {
      run(
        "insert into ir_appliance_keys (id, appliance_id, button, format, code, created_at) values ('k2', 'ac', 'Power', 'pulses', 'x', ?)",
        NOW,
      );
    }).toThrow();
    expect(() => {
      run(
        "insert into ir_appliance_keys (id, appliance_id, button, format, code, created_at) values ('k3', 'ac', 'Mode', 'library', 'x', ?)",
        NOW,
      );
    }).toThrow();
  });
});
