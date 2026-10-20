import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { Sql } from '../../src/store/sql';
import { captureLogs, testLogger } from '../support/logs';

const BEFORE = '2026-10-19T08:00:00.000Z';
const NOW = '2026-10-19T13:00:00.000Z';
const OLD = '6a000000-0000-4000-8000-000000000001';
const NEW = '6a000000-0000-4000-8000-000000000002';
const GONE = '6a000000-0000-4000-8000-000000000003';
const PROFILE = '6c000000-0000-4000-8000-000000000001';
const HASH = 'a'.repeat(64);
const LAST_BEFORE = MIGRATIONS.filter((migration) => migration.version <= 130);

const COUNT = z.object({ count: z.number() });
const ID = z.object({ id: z.string() });
const COLUMN = z.object({ name: z.string() });

let database: DatabaseSync;

function run(text: string, ...values: (string | number | null)[]): void {
  database.prepare(text).run(...values);
}

function ids(text: string): string[] {
  return z
    .array(ID)
    .parse(database.prepare(text).all())
    .map((row) => row.id);
}

function count(text: string): number {
  return COUNT.parse(database.prepare(text).get()).count;
}

function columns(table: string): string[] {
  return z
    .array(COLUMN)
    .parse(database.prepare(`pragma table_info(${table})`).all())
    .map((row) => row.name);
}

function seedAutomation(id: string, name: string, original: string | null): void {
  run(
    `insert into automations (id, name, enabled, revision, definition, definition_v2, definition_v1, created_at, updated_at)
     values (?, ?, ?, 1, '{"version":3}', ?, ?, ?, ?)`,
    id,
    name,
    original === null ? 1 : 0,
    original,
    original,
    BEFORE,
    BEFORE,
  );
  run(
    `insert into automation_revisions (automation_id, revision, definition, plan_hash, saved_at) values (?, 1, '{}', ?, ?)`,
    id,
    HASH,
    BEFORE,
  );
  run(
    `insert into automation_node_state (automation_id, node_id, state, updated_at) values (?, 'n1', '{}', ?)`,
    id,
    BEFORE,
  );
  run(
    `insert into automation_values (id, content, revision, created_at, updated_at, owner_automation_id) values (?, '{}', 1, ?, ?, ?)`,
    `value-${id}`,
    BEFORE,
    BEFORE,
    id,
  );
  run(
    `insert into automation_speech_grants (automation_id, revision, principal, watermark) values (?, '1', '{}', 0)`,
    id,
  );
  run(
    `insert into harness_effect_authorities (kind, id, profile_id, authorities) values ('automation', ?, ?, '[]')`,
    id,
    PROFILE,
  );
}

function seedRun(id: string, automationId: string, planHash: string | null): void {
  run(
    `insert into automation_runs (id, automation_id, revision, status, plan_hash, legacy_trace, created_at) values (?, ?, 1, 'succeeded', ?, ?, ?)`,
    id,
    automationId,
    planHash,
    planHash === null ? '[]' : null,
    BEFORE,
  );
  run(
    'insert into automation_run_commands (run_id, command_id) values (?, ?)',
    id,
    `command-${id}`,
  );
}

function seed(): void {
  run(
    `insert into profiles (id, name, colour, fitness_goals, position, created_at, updated_at) values (?, 'Owner', 'amber', '{}', 1, ?, ?)`,
    PROFILE,
    BEFORE,
    BEFORE,
  );
  seedAutomation(OLD, 'Old lamp', '{"when":[],"steps":[]}');
  seedAutomation(NEW, 'New lamp', null);
  seedRun('run-old', OLD, null);
  seedRun('run-gone', GONE, null);
  seedRun('run-new', NEW, HASH);
  run(
    `insert into automation_run_nodes (run_id, seq, path, node_id, status) values ('run-new', 0, 'n1', 'n1', 'succeeded')`,
  );
  run(
    `insert into harness_effect_authorities (kind, id, profile_id, authorities) values ('automation', ?, ?, '[]')`,
    GONE,
    PROFILE,
  );
}

beforeEach(() => {
  captureLogs();
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  migrate(new Sql(database), LAST_BEFORE, BEFORE, testLogger());
  seed();
  migrate(new Sql(database), MIGRATIONS, NOW, testLogger());
});

describe('the migration that drops the old automations', () => {
  it('deletes every old automation and keeps every new one', () => {
    expect(ids('select id from automations')).toStrictEqual([NEW]);
  });

  it('deletes the runs, run commands and records that belonged only to old automations', () => {
    expect(ids('select id from automation_runs')).toStrictEqual(['run-new']);
    expect(count('select count(*) as count from automation_run_commands')).toBe(1);
    expect(count('select count(*) as count from automation_run_nodes')).toBe(1);
    for (const table of [
      'automation_revisions',
      'automation_node_state',
      'automation_speech_grants',
    ]) {
      expect(ids(`select automation_id as id from ${table}`)).toStrictEqual([NEW]);
    }
    expect(ids('select owner_automation_id as id from automation_values')).toStrictEqual([NEW]);
    expect(
      ids("select id from harness_effect_authorities where kind = 'automation'"),
    ).toStrictEqual([NEW]);
  });

  it('removes the columns that only held the old format', () => {
    expect(columns('automations')).not.toContain('definition_v2');
    expect(columns('automations')).not.toContain('definition_v1');
    expect(columns('automation_runs')).not.toContain('legacy_trace');
  });

  it('makes a run without a compiled plan impossible', () => {
    expect(() => {
      run(
        `insert into automation_runs (id, automation_id, revision, status, created_at) values ('run-plain', ?, 1, 'queued', ?)`,
        NEW,
        NOW,
      );
    }).toThrow(/NOT NULL constraint failed: automation_runs.plan_hash/u);
  });

  it('runs once and changes nothing on the next start', () => {
    migrate(new Sql(database), MIGRATIONS, NOW, testLogger());
    expect(ids('select id from automations')).toStrictEqual([NEW]);
    expect(MIGRATIONS.find((migration) => migration.version === 131)).toMatchObject({
      name: 'drop_old_automations',
    });
  });
});
