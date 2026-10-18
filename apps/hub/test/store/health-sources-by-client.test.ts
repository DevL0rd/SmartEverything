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

const NOW = '2026-10-16T09:00:00.000Z';
const BEFORE = 99;
const AFTER = 100;
const ROWS = z.array(z.record(z.string(), z.unknown()));

let directory: string;
let database: DatabaseSync;

beforeEach(async () => {
  captureLogs();
  directory = await mkdtemp(join(tmpdir(), 'hub-health-sources-'));
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

function rows(sql: string): Record<string, unknown>[] {
  return ROWS.parse(database.prepare(sql).all());
}

function client(id: string): void {
  run(
    "insert into clients (id, name, platform, role, token_hash, created_at) values (?, ?, 'android', 'member', ?, ?)",
    id,
    `Phone ${id}`,
    `hash-${id}`,
    NOW,
  );
}

function source(
  id: string,
  clientId: string | null,
  options: { syncedAt: string | null; revokedAt?: string | null } = { syncedAt: null },
): void {
  run(
    `insert into health_sources (id, client_id, name, token_hash, granted_types, last_sync_at, created_at, revoked_at)
     values (?, ?, ?, ?, '["Steps"]', ?, ?, ?)`,
    id,
    clientId,
    `Source ${id}`,
    `token-${id}`,
    options.syncedAt,
    NOW,
    options.revokedAt ?? null,
  );
}

function seed(): void {
  upTo(BEFORE);
  run(
    "insert into profiles (id, name, colour, fitness_goals, created_at, updated_at) values ('p1', 'Ann', 'amber', '{}', ?, ?)",
    NOW,
    NOW,
  );
  client('c1');
  client('c2');
  client('c3');
  source('s1-old', 'c1', { syncedAt: '2026-10-10T00:00:00.000Z', revokedAt: NOW });
  source('s1-quiet', 'c1', { syncedAt: '2026-10-11T00:00:00.000Z' });
  source('s1-busy', 'c1', { syncedAt: '2026-10-15T00:00:00.000Z' });
  source('s2', 'c2');
  source('s3-revoked', 'c3', { syncedAt: NOW, revokedAt: NOW });
  source('s-orphan', null, { syncedAt: NOW });
  run(
    `insert into health_entries (id, profile_id, record_type, start_time, data, created_at, updated_at)
     values ('e1', 'p1', 'Nutrition', ?, '{}', ?, ?)`,
    NOW,
    NOW,
    NOW,
  );
  run("insert into health_entry_writes values ('e1', 's1-old', 2, '2026-10-10T00:00:00.000Z')");
  run("insert into health_entry_writes values ('e1', 's1-busy', 3, '2026-10-15T00:00:00.000Z')");
  run("insert into health_entry_writes values ('e1', 's2', 1, '2026-10-12T00:00:00.000Z')");
  run("insert into health_entry_failures values ('e1', 's1-quiet', 3, 'refused', ?)", NOW);
  run("insert into health_entry_failures values ('e1', 's-orphan', 3, 'refused', ?)", NOW);
  run(
    `insert into devices (id, provider, external_id, kind, name, model, manufacturer, capabilities, details, created_at, updated_at)
     values ('d1', 'xiaomi', 'scale', 'scale', 'Scale', 'S400', 'Xiaomi', '[]', '{}', ?, ?)`,
    NOW,
    NOW,
  );
  run(
    `insert into body_readings (id, device_id, profile_id, measured_at, weight_kg, attribution, created_at, updated_at)
     values ('b1', 'd1', 'p1', ?, 70, 'matched', ?, ?)`,
    NOW,
    NOW,
    NOW,
  );
  run("insert into body_reading_writes values ('b1', 's2', 1, ?)", NOW);
}

describe('health sources keyed by client', () => {
  it('keeps one status row per paired phone, from its most recently synced live source', () => {
    seed();
    upTo(AFTER);
    expect(
      rows('select client_id, name, last_sync_at from health_sources order by client_id'),
    ).toStrictEqual([
      { client_id: 'c1', name: 'Source s1-busy', last_sync_at: '2026-10-15T00:00:00.000Z' },
      { client_id: 'c2', name: 'Source s2', last_sync_at: null },
    ]);
    expect(rows('pragma table_info(health_sources)').map((column) => column['name'])).toStrictEqual(
      ['client_id', 'name', 'granted_types', 'last_sync_at', 'last_error', 'created_at'],
    );
  });

  it('moves delivery marks onto the client, newest version first, and drops orphans', () => {
    seed();
    upTo(AFTER);
    expect(
      rows('select entry_id, source_id, version from health_entry_writes order by source_id'),
    ).toStrictEqual([
      { entry_id: 'e1', source_id: 'c1', version: 3 },
      { entry_id: 'e1', source_id: 'c2', version: 1 },
    ]);
    expect(rows('select source_id, reason from health_entry_failures')).toStrictEqual([
      { source_id: 'c1', reason: 'refused' },
    ]);
    expect(rows('select reading_id, source_id from body_reading_writes')).toStrictEqual([
      { reading_id: 'b1', source_id: 'c2' },
    ]);
  });

  it('deletes a phone’s marks and status with the phone', () => {
    seed();
    upTo(AFTER);
    run('delete from clients where id = ?', 'c1');
    expect(rows('select client_id from health_sources')).toStrictEqual([{ client_id: 'c2' }]);
    expect(rows('select source_id from health_entry_writes')).toStrictEqual([{ source_id: 'c2' }]);
    expect(rows('pragma foreign_key_check')).toStrictEqual([]);
  });
});
