import { mkdtemp, rm } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { Sql } from '../../src/store/sql';
import { captureLogs, testLogger } from '../support/logs';

const NOW = '2026-10-18T09:00:00.000Z';
const BEFORE = 119;
const MOBILE = 'st-mobile';
const TELEVISION = 'st-tv';
const PAIRED = 'local-phone';
const ROWS = z.array(z.record(z.string(), z.unknown()));

let directory: string;
let database: DatabaseSync;

beforeEach(async () => {
  captureLogs();
  directory = await mkdtemp(join(tmpdir(), 'hub-mobile-presence-'));
  database = new DatabaseSync(join(directory, 'hub.db'), { enableForeignKeyConstraints: true });
});

afterEach(async () => {
  database.close();
  await rm(directory, { recursive: true, force: true });
});

function upTo(version: number): void {
  migrate(
    new Sql(database),
    MIGRATIONS.filter((migration) => migration.version <= version),
    NOW,
    testLogger(),
  );
}

function run(sql: string, ...values: (string | number | null)[]): void {
  database.prepare(sql).run(...values);
}

function count(table: string, deviceId: string): number {
  const rows = ROWS.parse(
    database.prepare(`select count(*) as n from ${table} where device_id = ?`).all(deviceId),
  );
  return Number(rows[0]?.['n']);
}

function rowCount(id: string): number {
  const rows = ROWS.parse(
    database.prepare('select count(*) as n from devices where id = ?').all(id),
  );
  return Number(rows[0]?.['n']);
}

interface Seeded {
  readonly provider: string;
  readonly kind: string;
  readonly integration: string | null;
  readonly model: string;
}

function device(id: string, seeded: Seeded): void {
  run(
    'insert into devices (id, provider, external_id, kind, name, model, manufacturer, details, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id,
    seeded.provider,
    `ext-${id}`,
    seeded.kind,
    id,
    seeded.model,
    'maker',
    JSON.stringify({ integration: seeded.integration }),
    NOW,
    NOW,
  );
  run(
    "insert into device_state (device_id, capability, value, observed_at) values (?, 'occupancy', 'true', ?)",
    id,
    NOW,
  );
  run(
    "insert into state_history (device_id, capability, value, observed_at) values (?, 'occupancy', 'true', ?)",
    id,
    NOW,
  );
}

function seed(): void {
  upTo(BEFORE);
  device(MOBILE, {
    provider: 'smartthings',
    kind: 'other',
    integration: 'MOBILE',
    model: 'SmartThings-smartthings-Mobile_Presence',
  });
  device(TELEVISION, {
    provider: 'smartthings',
    kind: 'television',
    integration: 'OCF',
    model: 'QA65S95BAKXXT',
  });
  device(PAIRED, {
    provider: 'local',
    kind: 'phone',
    integration: null,
    model: 'smarteverything.android',
  });
}

describe('removing the SmartThings mobile presence devices', () => {
  it('removes the old phone presence with its state and history and nothing else', () => {
    seed();
    upTo(120);
    expect(rowCount(MOBILE)).toBe(0);
    expect(count('device_state', MOBILE)).toBe(0);
    expect(count('state_history', MOBILE)).toBe(0);
    [TELEVISION, PAIRED].forEach((id) => {
      expect(rowCount(id)).toBe(1);
      expect(count('device_state', id)).toBe(1);
      expect(count('state_history', id)).toBe(1);
    });
  });

  it('keeps every device when there is no mobile presence to remove', () => {
    upTo(BEFORE);
    device(PAIRED, {
      provider: 'local',
      kind: 'phone',
      integration: null,
      model: 'smarteverything.android',
    });
    upTo(120);
    expect(count('device_state', PAIRED)).toBe(1);
  });
});
