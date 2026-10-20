import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { AUTOMATIONS_V3_STATEMENTS } from '../../src/store/migrations/automations-v3-schema';
import { Sql } from '../../src/store/sql';
import { captureLogs, testLogger } from '../support/logs';

const NOW = '2026-10-18T09:00:00.000Z';
const HASH = 'a'.repeat(64);
const AUTOMATION = '3a000000-0000-4000-8000-000000000001';
const OTHER = '3a000000-0000-4000-8000-000000000002';
const RUN = '3b000000-0000-4000-8000-000000000001';
const FUNCTION = '3c000000-0000-4000-8000-000000000001';

const COLUMN = z.object({ name: z.string(), notnull: z.number() });
const NAME = z.object({ name: z.string() });
const RUN_ROW = z.object({
  id: z.string(),
  status: z.string(),
  legacy_trace: z.string().nullable(),
  mode: z.string(),
  plan_refs: z.string(),
  cause_chain: z.string(),
  active_paths: z.string(),
  steps: z.number(),
  plan_hash: z.string().nullable(),
});
const AUTOMATION_ROW = z.object({ layout: z.string(), draft: z.string().nullable() });

let database: DatabaseSync;

function columns(table: string): Map<string, number> {
  const rows = z.array(COLUMN).parse(database.prepare(`pragma table_info(${table})`).all());
  return new Map(rows.map((row) => [row.name, row.notnull]));
}

function names(kind: 'table' | 'index'): string[] {
  return z
    .array(NAME)
    .parse(database.prepare('select name from sqlite_master where type = ?').all(kind))
    .map((row) => row.name);
}

function seedOldRows(): void {
  database
    .prepare(
      'insert into automations (id, name, enabled, definition, run_count, created_at, updated_at) values (?, ?, 1, ?, 0, ?, ?)',
    )
    .run(AUTOMATION, 'Lamp', '{"when":[],"steps":[]}', NOW, NOW);
  database
    .prepare(
      `insert into automation_runs (id, automation_id, revision, status, trace, created_at)
       values (?, ?, 1, 'succeeded', '[{"step":1}]', ?)`,
    )
    .run(RUN, AUTOMATION, NOW);
  database
    .prepare(
      "insert into automation_values (id, content, revision, created_at, updated_at) values ('v1', '{}', 1, ?, ?)",
    )
    .run(NOW, NOW);
}

function apply(): void {
  database.exec('begin');
  for (const statement of AUTOMATIONS_V3_STATEMENTS) database.exec(statement);
  database.exec('commit');
}

function insertRevision(automationId: string, revision: number, hash: string): void {
  database
    .prepare(
      `insert into automation_revisions (automation_id, revision, definition, plan_hash, saved_at)
       values (?, ?, '{}', ?, ?)`,
    )
    .run(automationId, revision, hash, NOW);
}

beforeEach(() => {
  captureLogs();
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  migrate(
    new Sql(database),
    MIGRATIONS.filter((migration) => migration.version < 130),
    NOW,
    testLogger(),
  );
  seedOldRows();
  apply();
});

describe('the automations v3 schema statements', () => {
  it('adds the new automation columns and keeps existing rows valid', () => {
    const automation = columns('automations');
    expect([...automation.keys()]).toEqual(
      expect.arrayContaining(['draft', 'layout', 'definition_v2']),
    );
    expect(automation.get('draft')).toBe(0);
    expect(automation.get('definition_v2')).toBe(0);
    const row = AUTOMATION_ROW.parse(
      database.prepare('select layout, draft from automations').get(),
    );
    expect(JSON.parse(row.layout)).toStrictEqual({ nodes: {}, frames: [], comments: [] });
    expect(row.draft).toBeNull();
  });

  it('creates every new table and index', () => {
    expect(names('table')).toEqual(
      expect.arrayContaining([
        'automation_revisions',
        'automation_functions',
        'automation_function_revisions',
        'automation_plans',
        'automation_run_nodes',
        'automation_decisions',
        'automation_node_state',
        'automation_tests',
      ]),
    );
    expect(names('index')).toEqual(
      expect.arrayContaining([
        'automation_runs_target',
        'automation_runs_status',
        'automation_runs_wake',
        'automation_runs_plan',
        'automation_run_nodes_node',
        'automation_decisions_window',
        'automation_node_state_wake',
        'automation_values_owner',
      ]),
    );
    expect(names('table')).not.toContain('automation_runs_next');
  });

  it('rebuilds the runs table with the new columns and the old trace as legacy_trace', () => {
    const runs = columns('automation_runs');
    for (const name of [
      'plan_hash',
      'plan_refs',
      'mode',
      'state',
      'wake_at',
      'waiting_on',
      'trigger',
      'cause_chain',
      'started_by',
      'steps',
      'commands',
      'iterations',
      'active_paths',
      'legacy_trace',
    ])
      expect(runs.has(name)).toBe(true);
    expect(runs.has('trace')).toBe(false);
    expect(runs.get('legacy_trace')).toBe(0);
    const row = RUN_ROW.parse(database.prepare('select * from automation_runs').get());
    expect(row).toMatchObject({
      id: RUN,
      status: 'succeeded',
      legacy_trace: '[{"step":1}]',
      mode: 'live',
      plan_refs: '[]',
      cause_chain: '[]',
      active_paths: '[]',
      steps: 0,
      plan_hash: null,
    });
  });

  it('accepts the new run statuses and rejects bad modes and hashes', () => {
    const insert = database.prepare(
      'insert into automation_runs (id, automation_id, revision, status, created_at, mode, plan_hash) values (?, ?, 1, ?, ?, ?, ?)',
    );
    insert.run('r-waiting', AUTOMATION, 'waiting', NOW, 'simulated', HASH);
    insert.run('r-paused', AUTOMATION, 'paused', NOW, 'dry', null);
    expect(() => {
      insert.run('r-bad-mode', AUTOMATION, 'queued', NOW, 'other', null);
    }).toThrow();
    expect(() => {
      insert.run('r-bad-hash', AUTOMATION, 'queued', NOW, 'live', 'xyz');
    }).toThrow();
  });

  it('stores revisions per automation and cascades with the automation', () => {
    insertRevision(AUTOMATION, 1, HASH);
    expect(() => {
      insertRevision(AUTOMATION, 1, HASH);
    }).toThrow();
    expect(() => {
      insertRevision(AUTOMATION, 2, 'A'.repeat(64));
    }).toThrow();
    expect(() => {
      insertRevision(OTHER, 1, HASH);
    }).toThrow();
    database.prepare('delete from automations where id = ?').run(AUTOMATION);
    expect(database.prepare('select * from automation_revisions').all()).toStrictEqual([]);
  });

  it('stores functions with unique names and immutable revision keys', () => {
    const insert = database.prepare(
      `insert into automation_functions (id, name, latest_revision, created_at, updated_at)
       values (?, ?, 1, ?, ?)`,
    );
    insert.run(FUNCTION, 'Dim', NOW, NOW);
    expect(() => {
      insert.run('other', 'Dim', NOW, NOW);
    }).toThrow();
    const revision = database.prepare(
      `insert into automation_function_revisions (function_id, revision, definition, interface_hash, compat, plan_hash, saved_at)
       values (?, ?, '{}', ?, ?, ?, ?)`,
    );
    revision.run(FUNCTION, 1, HASH, 'compatible', HASH, NOW);
    expect(() => {
      revision.run(FUNCTION, 1, HASH, 'compatible', HASH, NOW);
    }).toThrow();
    expect(() => {
      revision.run(FUNCTION, 2, HASH, 'sideways', HASH, NOW);
    }).toThrow();
  });

  it('stores plans by hash and kind', () => {
    const insert = database.prepare(
      'insert into automation_plans (hash, kind, json, created_at) values (?, ?, ?, ?)',
    );
    insert.run(HASH, 'automation', '{}', NOW);
    expect(() => {
      insert.run(HASH, 'automation', '{}', NOW);
    }).toThrow();
    expect(() => {
      insert.run('b'.repeat(64), 'other', '{}', NOW);
    }).toThrow();
  });

  it('keeps node records per run in order and cascades with the run', () => {
    const insert = database.prepare(
      `insert into automation_run_nodes (run_id, seq, path, node_id, status) values (?, ?, 'a/b', 'n1', ?)`,
    );
    insert.run(RUN, 0, 'succeeded');
    expect(() => {
      insert.run(RUN, 0, 'running');
    }).toThrow();
    expect(() => {
      insert.run(RUN, 1, 'unknown');
    }).toThrow();
    expect(() => {
      insert.run('missing', 0, 'running');
    }).toThrow();
    database.prepare('delete from automation_runs where id = ?').run(RUN);
    expect(database.prepare('select * from automation_run_nodes').all()).toStrictEqual([]);
  });

  it('counts decisions per window and reason with a closed reason list', () => {
    const insert = database.prepare(
      `insert into automation_decisions (automation_id, window_start, reason, count, first_at, last_at)
       values (?, ?, ?, ?, ?, ?)`,
    );
    insert.run(AUTOMATION, NOW, 'storm', 3, NOW, NOW);
    expect(() => {
      insert.run(AUTOMATION, NOW, 'storm', 1, NOW, NOW);
    }).toThrow();
    expect(() => {
      insert.run(AUTOMATION, NOW, 'bored', 1, NOW, NOW);
    }).toThrow();
    expect(() => {
      insert.run(AUTOMATION, NOW, 'stale', 0, NOW, NOW);
    }).toThrow();
  });

  it('keeps node state per partition and tests per automation', () => {
    const state = database.prepare(
      `insert into automation_node_state (automation_id, node_id, partition, state, updated_at) values (?, 'n1', ?, '{}', ?)`,
    );
    state.run(AUTOMATION, '', NOW);
    state.run(AUTOMATION, 'room', NOW);
    expect(() => state.run(AUTOMATION, 'room', NOW)).toThrow();
    const test = database.prepare(
      `insert into automation_tests (automation_id, id, name, scenario, updated_at) values (?, ?, ?, ?, ?)`,
    );
    test.run(AUTOMATION, 't1', 'Dark room', '{}', NOW);
    expect(() => test.run(AUTOMATION, 't1', 'Again', '{}', NOW)).toThrow();
    expect(() => test.run(AUTOMATION, 't2', 'Bad', '[]', NOW)).toThrow();
    database.prepare('delete from automations where id = ?').run(AUTOMATION);
    expect(database.prepare('select * from automation_tests').all()).toStrictEqual([]);
    expect(database.prepare('select * from automation_node_state').all()).toStrictEqual([]);
  });

  it('lets a value belong to an automation and leaves home values unowned', () => {
    expect(columns('automation_values').has('owner_automation_id')).toBe(true);
    const unowned = database
      .prepare('select owner_automation_id from automation_values where id = ?')
      .get('v1');
    expect(unowned).toEqual({ owner_automation_id: null });
    database
      .prepare(
        "insert into automation_values (id, content, revision, created_at, updated_at, owner_automation_id) values ('v2', '{}', 1, ?, ?, ?)",
      )
      .run(NOW, NOW, AUTOMATION);
    expect(() =>
      database
        .prepare(
          "insert into automation_values (id, content, revision, created_at, updated_at, owner_automation_id) values ('v3', '{}', 1, ?, ?, 'missing')",
        )
        .run(NOW, NOW),
    ).toThrow();
    database.prepare('delete from automations where id = ?').run(AUTOMATION);
    expect(database.prepare('select id from automation_values').all()).toEqual([{ id: 'v1' }]);
  });

  it('leaves the database consistent', () => {
    expect(database.prepare('pragma foreign_key_check').all()).toStrictEqual([]);
    expect(database.prepare('pragma integrity_check').get()).toEqual({
      integrity_check: 'ok',
    });
  });
});
