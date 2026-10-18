import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { Sql } from '../../src/store/sql';
import { openStore } from '../../src/store/store';
import { testLogger } from '../support/logs';

const NOW = '2026-10-17T09:00:00.000Z';
const LAMP = '0e000000-0000-4000-8000-0000000000d1';
const FAN = '0e000000-0000-4000-8000-0000000000d2';
const LOW = '0e000000-0000-4000-8000-0000000000e1';
const HIGH = '0e000000-0000-4000-8000-0000000000e2';
const RUN = '0e000000-0000-4000-8000-0000000000f1';
const NODE = '0e000000-0000-4000-8000-0000000000f2';

let directory: string;
let path: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hub-effect-rows-'));
  path = join(directory, 'hub.db');
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function effect(id: string, value: number, priority: number, order: number): object {
  return {
    id,
    runId: RUN,
    nodeId: NODE,
    operation: { type: 'set', value },
    priority,
    order,
    expiresAt: '2026-10-17T10:00:00.000Z',
  };
}

function seedBefore(): void {
  const database = new DatabaseSync(path, { enableForeignKeyConstraints: true });
  migrate(
    new Sql(database),
    MIGRATIONS.filter((migration) => migration.version <= 90),
    NOW,
    testLogger(),
  );
  const device = database.prepare(
    "insert into devices (id, provider, external_id, kind, name, model, manufacturer, online, capabilities, details, created_at, updated_at) values (?, 'local', ?, 'light', 'Lamp', 'm', 'v', 1, '[]', '{}', ?, ?)",
  );
  device.run(LAMP, 'lamp', NOW, NOW);
  device.run(FAN, 'fan', NOW, NOW);
  const target = database.prepare(
    'insert into device_effect_targets (device_id, capability, base, resolved, generation, effects, command_id, updated_at) values (?, ?, ?, ?, ?, ?, null, ?)',
  );
  target.run(
    LAMP,
    'brightness',
    '60',
    '80',
    3,
    JSON.stringify([effect(LOW, 20, 0, 1), effect(HIGH, 80, 5, 2)]),
    NOW,
  );
  target.run(FAN, 'speed', '2', '2', 4, '[]', NOW);
  database.close();
}

describe('migrating a schema-90 database to temporary changes stored as rows', () => {
  it('keeps every active temporary change with its base and drops controls that have none', () => {
    seedBefore();

    const store = openStore({
      path,
      log: testLogger(),
      now: () => new Date(NOW),
      systemTimeZone: 'UTC',
    });
    const targets = store.deviceEffects.list();
    store.close();

    expect(targets).toStrictEqual([
      {
        device_id: LAMP,
        capability: 'brightness',
        base: 60,
        resolved: 80,
        updated_at: NOW,
        effects: [effect(LOW, 20, 0, 1), effect(HIGH, 80, 5, 2)],
      },
    ]);
    const migrated = new DatabaseSync(path);
    const tables = z
      .array(z.object({ name: z.string() }))
      .parse(
        migrated
          .prepare(
            "select name from sqlite_master where type = 'table' and name like 'device_effect%' order by name",
          )
          .all(),
      );
    migrated.close();
    expect(tables.map((table) => table.name)).toStrictEqual([
      'device_effect_controls',
      'device_effects',
    ]);
  });
});
