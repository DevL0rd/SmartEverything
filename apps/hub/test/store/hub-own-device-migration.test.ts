import { mkdtemp, rm } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_HISTORY_SETTINGS, HISTORY_SETTINGS } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { Sql } from '../../src/store/sql';
import { captureLogs, testLogger } from '../support/logs';

const NOW = '2026-11-07T09:00:00.000Z';
const BEFORE = 190;
const AFTER = 191;
const HUB_MODEL = 'smarteverything.computer.hub';
const PC_MODEL = 'smarteverything.computer';
const NODE = 'fda22089-7faa-4b09-b39c-6281a9ebaeca';
const OTHER = '1a563d7f-0000-4000-8000-000000000001';
const MACHINE = '484e39c215d14bd68cd5f8679d8febbb';
const ROWS = z.array(z.record(z.string(), z.unknown()));

let directory: string;
let database: DatabaseSync;

beforeEach(async () => {
  captureLogs();
  directory = await mkdtemp(join(tmpdir(), 'hub-own-device-'));
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

function computer(id: string, externalId: string, model: string): void {
  run(
    "insert into devices (id, provider, external_id, kind, name, model, manufacturer, details, created_at, updated_at) values (?, 'local', ?, 'computer', 'Laptop', ?, 'Linux', '{\"os\":\"Linux\"}', ?, ?)",
    id,
    externalId,
    model,
    NOW,
    NOW,
  );
}

function bindings(id: string): void {
  run(
    "insert into computer_ai (device_id, runtime, settings, updated_at) values (?, 'claude', '{}', ?)",
    id,
    NOW,
  );
  run(
    "insert into computer_native_mcp_policy (device_id, runtime, policy, updated_at) values (?, 'claude', '{}', ?)",
    id,
    NOW,
  );
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
  run(
    "insert into ai_provider_sessions (chat_id, device_id, runtime, session_id) values ('chat', ?, 'claude', 's')",
    id,
  );
  run(
    "insert into ai_engine_preferences (runtime, model, device_id, updated_at) values ('claude', 'm', ?, ?)",
    id,
    NOW,
  );
}

function node(id: string): void {
  run(
    "insert into computer_nodes (device_id, machine_id, token_hash, hub_url, paired_at) values (?, ?, 't', 'http://h', ?)",
    id,
    MACHINE,
    NOW,
  );
  run(
    "insert into computer_runtime_grants (device_id, runtime, token_hash) values (?, 'claude', 'g')",
    id,
  );
  run("insert into computer_scopes (device_id, scopes, updated_at) values (?, '{}', ?)", id, NOW);
}

function count(table: string, deviceId: string): number {
  return Number(
    rows(`select count(*) as n from ${table} where device_id = '${deviceId}'`)[0]?.['n'],
  );
}

function hubRows(): Record<string, unknown>[] {
  return rows(
    "select id, model, name, external_id, online, capabilities from devices where external_id = 'computer:hub'",
  );
}

describe('the hub gets its own device', () => {
  it('turns the hub-model node row into a pc and moves the runtime bindings to a new hub row', () => {
    upTo(BEFORE);
    computer(NODE, `computer:${MACHINE}`, HUB_MODEL);
    node(NODE);
    bindings(NODE);
    upTo(AFTER);

    expect(rows(`select model from devices where id = '${NODE}'`)).toEqual([{ model: PC_MODEL }]);
    const [hub] = hubRows();
    expect(hub).toMatchObject({ model: HUB_MODEL, name: 'Laptop', online: 1, capabilities: '[]' });
    const hubId = String(hub?.['id']);
    expect(hubId).not.toBe(NODE);
    for (const table of [
      'computer_ai',
      'computer_native_mcp_policy',
      'ai_provider_sessions',
      'ai_engine_preferences',
    ]) {
      expect(count(table, hubId)).toBe(1);
      expect(count(table, NODE)).toBe(0);
    }
    expect(count('computer_nodes', NODE)).toBe(1);
    expect(count('computer_runtime_grants', NODE)).toBe(1);
    expect(count('computer_scopes', NODE)).toBe(1);
    expect(rows('pragma foreign_key_check')).toEqual([]);
  });

  it('points the cached runtime models at the hub row', () => {
    upTo(BEFORE);
    computer(NODE, `computer:${MACHINE}`, HUB_MODEL);
    run(
      "insert into computer_ai (device_id, runtime, settings, models, updated_at) values (?, 'claude', '{}', ?, ?)",
      NODE,
      JSON.stringify([
        { device_id: NODE, id: 'default', name: 'Default' },
        { device_id: NODE, id: 'fast', name: 'Fast' },
      ]),
      NOW,
    );
    upTo(AFTER);

    const hubId = String(hubRows()[0]?.['id']);
    const row = z.object({ models: z.string() }).parse(rows('select models from computer_ai')[0]);
    expect(JSON.parse(row.models)).toEqual([
      { device_id: hubId, id: 'default', name: 'Default' },
      { device_id: hubId, id: 'fast', name: 'Fast' },
    ]);
  });

  it('moves a per-device history override to the hub row and leaves the class settings alone', () => {
    upTo(BEFORE);
    computer(NODE, `computer:${MACHINE}`, HUB_MODEL);
    const settings = {
      ...DEFAULT_HISTORY_SETTINGS,
      devices: {
        [NODE]: { interval_ms: 5000, window_ms: 60000 },
        [OTHER]: { interval_ms: 2000, window_ms: 120000 },
      },
    };
    run(
      "insert into settings (id, home_name, updated_at, history_settings) values (1, 'Home', ?, ?)",
      NOW,
      JSON.stringify(settings),
    );
    upTo(AFTER);

    const hubId = String(hubRows()[0]?.['id']);
    const row = z
      .object({ history_settings: z.string() })
      .parse(rows('select history_settings from settings')[0]);
    const stored = HISTORY_SETTINGS.parse(JSON.parse(row.history_settings));
    expect(stored.devices).toEqual({
      [hubId]: { interval_ms: 5000, window_ms: 60000 },
      [OTHER]: { interval_ms: 2000, window_ms: 120000 },
    });
    expect(stored.classes).toEqual(DEFAULT_HISTORY_SETTINGS.classes);
  });

  it('creates nothing on a database that never had a hub-model computer', () => {
    upTo(BEFORE);
    computer(NODE, `computer:${MACHINE}`, PC_MODEL);
    upTo(AFTER);

    expect(hubRows()).toEqual([]);
    expect(rows(`select model from devices where id = '${NODE}'`)).toEqual([{ model: PC_MODEL }]);
  });

  it('keeps an already registered hub row and still converts the node row', () => {
    upTo(BEFORE);
    computer(NODE, `computer:${MACHINE}`, HUB_MODEL);
    computer(OTHER, 'computer:hub', HUB_MODEL);
    bindings(NODE);
    upTo(AFTER);

    expect(hubRows().map((row) => row['id'])).toEqual([OTHER]);
    expect(count('computer_ai', OTHER)).toBe(1);
    expect(rows(`select model from devices where id = '${NODE}'`)).toEqual([{ model: PC_MODEL }]);
  });
});
