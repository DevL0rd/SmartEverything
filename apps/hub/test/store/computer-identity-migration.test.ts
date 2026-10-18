import { mkdtemp, rm } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { mergeComputerRoleRows } from '../../src/store/migrations/computer-identity';
import { Sql } from '../../src/store/sql';
import { captureLogs, testLogger } from '../support/logs';

const NOW = '2026-10-18T09:00:00.000Z';
const BEFORE = 101;
const MACHINE = '484e39c2aaaaaaaaaaaaaaaaaaaaaaaa';
const SURVIVOR = 'fda22089';
const DUPLICATE = '1a563d7f';
const ROWS = z.array(z.record(z.string(), z.unknown()));

let directory: string;
let database: DatabaseSync;

beforeEach(async () => {
  captureLogs();
  directory = await mkdtemp(join(tmpdir(), 'hub-computer-identity-'));
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

function count(table: string, deviceId: string): number {
  return Number(
    rows(`select count(*) as n from ${table} where device_id = '${deviceId}'`)[0]?.['n'],
  );
}

function device(id: string, externalId: string): void {
  run(
    "insert into devices (id, provider, external_id, kind, name, model, manufacturer, created_at, updated_at) values (?, 'local', ?, 'computer', 'Laptop', 'm', 'v', ?, ?)",
    id,
    externalId,
    NOW,
    NOW,
  );
}

function state(id: string, capability: string, value: string): void {
  run(
    'insert into device_state (device_id, capability, value, observed_at) values (?, ?, ?, ?)',
    id,
    capability,
    value,
    NOW,
  );
}

function metric(id: string, bucket: string, average: number): void {
  run(
    "insert into device_metrics (device_id, capability, resolution, bucket_start, average, minimum, maximum, count) values (?, 'cpu', 'minute', ?, ?, 1, 9, 1)",
    id,
    bucket,
    average,
  );
}

function history(id: string, at: string): void {
  run(
    "insert into state_history (device_id, capability, value, observed_at) values (?, 'cpu', '1', ?)",
    id,
    at,
  );
}

function seed(): void {
  upTo(BEFORE);
  device(SURVIVOR, `computer:${MACHINE}`);
  device(DUPLICATE, `computer:${MACHINE}:pc`);
  ['cpu', 'memory'].forEach((capability) => {
    state(SURVIVOR, capability, '1');
    state(DUPLICATE, capability, '2');
  });
  metric(SURVIVOR, '2026-10-17T10:00', 1);
  metric(DUPLICATE, '2026-10-17T10:00', 5);
  metric(DUPLICATE, '2026-10-17T10:01', 6);
  history(SURVIVOR, '2026-10-01T00:00:00.000Z');
  history(DUPLICATE, '2026-10-17T00:00:00.000Z');
  history(DUPLICATE, '2026-10-17T00:01:00.000Z');
  run(
    "insert into app_sessions (device_id, app_id, app_name, started_at, ended_at, seconds) values (?, 'a', 'App', ?, ?, 5)",
    DUPLICATE,
    NOW,
    NOW,
  );
  run(
    "insert into events (id, device_id, kind, occurred_at, created_at) values ('e1', ?, 'k', ?, ?)",
    DUPLICATE,
    NOW,
    NOW,
  );
  run(
    "insert into computer_scopes (device_id, scopes, updated_at) values (?, '{}', ?)",
    SURVIVOR,
    NOW,
  );
}

function node(id: string, machine: string): void {
  run(
    "insert into computer_nodes (device_id, machine_id, token_hash, hub_url, paired_at) values (?, ?, ?, 'http://h', ?)",
    id,
    machine,
    `t-${machine}`,
    NOW,
  );
  run(
    "insert into computer_runtime_grants (device_id, runtime, token_hash) values (?, 'claude', ?)",
    id,
    `g-${machine}`,
  );
}

function providerSession(id: string): void {
  run(
    "insert into ai_provider_sessions (chat_id, device_id, runtime, session_id) values ('chat', ?, 'claude', 's')",
    id,
  );
}

function chat(): void {
  run(
    "insert into profiles (id, name, colour, created_at, updated_at) values ('p', 'P', 'amber', ?, ?)",
    NOW,
    NOW,
  );
  run(
    "insert into ai_chats (id, profile_id, kind, title, engine, pinned, created_at, updated_at) values ('chat', 'p', 'chat', 'C', '{}', 0, ?, ?)",
    NOW,
    NOW,
  );
}

describe('merging the pc-suffixed computer row into the machine row', () => {
  it('keeps the survivor, drops duplicate state and metrics and moves the history', () => {
    seed();
    upTo(1000);

    expect(rows('select id, external_id from devices')).toEqual([
      { id: SURVIVOR, external_id: `computer:${MACHINE}` },
    ]);
    expect(count('device_state', SURVIVOR)).toBe(2);
    expect(rows(`select value from device_state where device_id = '${SURVIVOR}'`)).toEqual([
      { value: '1' },
      { value: '1' },
    ]);
    expect(count('device_metrics', SURVIVOR)).toBe(2);
    expect(
      rows(`select average from device_metrics where bucket_start = '2026-10-17T10:00'`),
    ).toEqual([{ average: 1 }]);
    expect(count('state_history', SURVIVOR)).toBe(3);
    expect(count('app_sessions', SURVIVOR)).toBe(1);
    expect(count('events', SURVIVOR)).toBe(1);
    expect(count('computer_scopes', SURVIVOR)).toBe(1);
    expect(rows('pragma foreign_key_check')).toEqual([]);
    ['device_state', 'device_metrics', 'state_history', 'app_sessions', 'events'].forEach(
      (table) => {
        expect(count(table, DUPLICATE)).toBe(0);
      },
    );
  });

  it('moves the node binding and its runtime grant when only the pc row owns them', () => {
    upTo(BEFORE);
    device(SURVIVOR, `computer:${MACHINE}`);
    device(DUPLICATE, `computer:${MACHINE}:pc`);
    node(DUPLICATE, 'm');
    upTo(1000);

    expect(rows('select device_id from computer_nodes')).toEqual([{ device_id: SURVIVOR }]);
    expect(rows('select device_id from computer_runtime_grants')).toEqual([
      { device_id: SURVIVOR },
    ]);
    expect(rows('select id from devices')).toEqual([{ id: SURVIVOR }]);
    expect(rows('pragma foreign_key_check')).toEqual([]);
  });

  it('keeps the survivor node binding when both rows own one', () => {
    upTo(BEFORE);
    device(SURVIVOR, `computer:${MACHINE}`);
    device(DUPLICATE, `computer:${MACHINE}:pc`);
    node(SURVIVOR, 'a');
    node(DUPLICATE, 'b');
    upTo(1000);

    expect(rows('select device_id, machine_id from computer_nodes')).toEqual([
      { device_id: SURVIVOR, machine_id: 'a' },
    ]);
    expect(rows('select token_hash from computer_runtime_grants')).toEqual([{ token_hash: 'g-a' }]);
    expect(rows('pragma foreign_key_check')).toEqual([]);
  });

  it('removes rows without a cascade that the survivor already has', () => {
    upTo(BEFORE);
    device(SURVIVOR, `computer:${MACHINE}`);
    device(DUPLICATE, `computer:${MACHINE}:pc`);
    chat();
    providerSession(SURVIVOR);
    providerSession(DUPLICATE);
    upTo(1000);

    expect(rows('select device_id from ai_provider_sessions')).toEqual([{ device_id: SURVIVOR }]);
    expect(rows('select id from devices')).toEqual([{ id: SURVIVOR }]);
    expect(rows('pragma foreign_key_check')).toEqual([]);
  });

  it('is idempotent', () => {
    seed();
    upTo(1000);
    const sql = new Sql(database);

    expect(mergeComputerRoleRows(sql)).toEqual({ duplicates: 0, merged: 0, renamed: 0 });
    expect(count('state_history', SURVIVOR)).toBe(3);
    expect(count('device_state', SURVIVOR)).toBe(2);
  });

  it('renames a lone pc row to the machine id and keeps all of its data', () => {
    upTo(BEFORE);
    device(DUPLICATE, `computer:${MACHINE}:pc`);
    state(DUPLICATE, 'cpu', '2');
    upTo(1000);

    expect(rows('select id, external_id from devices')).toEqual([
      { id: DUPLICATE, external_id: `computer:${MACHINE}` },
    ]);
    expect(count('device_state', DUPLICATE)).toBe(1);
  });

  it('does nothing on a database without computers', () => {
    upTo(BEFORE);
    device('other', 'computer:other-machine');
    upTo(1000);

    expect(rows('select external_id from devices')).toEqual([
      { external_id: 'computer:other-machine' },
    ]);
  });

  it('backs the database up before migrating', () => {
    seed();
    upTo(102);
    const backup = new DatabaseSync(join(directory, 'hub.db.v101-before-v102.sqlite'));
    expect(
      ROWS.parse(backup.prepare('select external_id from devices order by external_id').all()),
    ).toHaveLength(2);
    backup.close();
  });
});
