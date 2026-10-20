import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { AUTOMATION_RUNS_KEPT } from '@smarteverything/domain';
import { AUTOMATION_V2 } from '../../src/store/migrations/legacy/v2-schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { Sql } from '../../src/store/sql';
import { captureLogs, testLogger } from '../support/logs';

const BEFORE = 85;
const BEFORE_V3 = 126;
const NOW = '2026-10-16T09:00:00.000Z';
const LAMP = '1a000000-0000-4000-8000-000000000001';
const SENSOR = '1a000000-0000-4000-8000-000000000002';
const STEPS_ID = '1b000000-0000-4000-8000-000000000001';
const BROKEN_ID = '1b000000-0000-4000-8000-000000000002';
const PLAIN_ID = '1b000000-0000-4000-8000-000000000003';
const SEQUENCE_ID = '1c000000-0000-4000-8000-000000000001';
const PROFILE = '1d000000-0000-4000-8000-000000000001';
const NODE = '1e000000-0000-4000-8000-000000000001';

const COUNT = z.object({ count: z.number() });
const ROW = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.number(),
  revision: z.number(),
  definition: z.string(),
  definition_v1: z.string().nullable(),
  last_error: z.string().nullable(),
});
const RUN = z.object({ id: z.string(), revision: z.number() });
const GRANT = z.object({ automation_id: z.string(), revision: z.string() });
const KIND = z.object({ kind: z.string() });

let directory: string;
let path: string;

beforeEach(async () => {
  captureLogs();
  directory = await mkdtemp(join(tmpdir(), 'hub-automation-v2-'));
  path = join(directory, 'hub.db');
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function build(): DatabaseSync {
  const database = new DatabaseSync(path, { enableForeignKeyConstraints: true });
  migrate(
    new Sql(database),
    MIGRATIONS.filter((migration) => migration.version <= BEFORE),
    NOW,
    testLogger(),
  );
  return database;
}

const PLAIN = {
  triggers: [
    {
      type: 'state',
      deviceId: SENSOR,
      capability: 'occupancy',
      comparison: { operator: 'eq', value: true },
    },
  ],
  conditions: { mode: 'all', items: [] },
  actions: [{ type: 'command', deviceId: LAMP, capability: 'power', value: true }],
  origin: null,
};

const WITH_STOP_RUN = {
  triggers: [{ type: 'interval', everyMinutes: 5 }],
  conditions: { mode: 'all', items: [] },
  actions: [{ type: 'stop', nodeId: NODE, target: { type: 'run', runId: PROFILE } }],
  origin: null,
};

const SEQUENCE = {
  actions: [
    { type: 'delay', seconds: 30 },
    { type: 'command', deviceId: LAMP, capability: 'power', value: false },
  ],
  parameters: [{ name: 'level', kind: 'number' }],
  origin: null,
};

function seed(database: DatabaseSync): void {
  database
    .prepare(
      "insert into profiles (id, name, colour, fitness_goals, position, created_at, updated_at) values (?, 'Ann', 'amber', '{}', 0, ?, ?)",
    )
    .run(PROFILE, NOW, NOW);
  const automation = database.prepare(
    'insert into automations (id, name, enabled, definition, run_count, created_at, updated_at) values (?, ?, 1, ?, 0, ?, ?)',
  );
  automation.run(STEPS_ID, 'Occupied', JSON.stringify(PLAIN), NOW, NOW);
  automation.run(BROKEN_ID, 'Stops a run', JSON.stringify(WITH_STOP_RUN), NOW, NOW);
  automation.run(PLAIN_ID, 'Dim', JSON.stringify({ ...PLAIN, origin: null }), NOW, NOW);
  database
    .prepare('update automations set last_error = ? where id = ?')
    .run('ApiError: This automation’s permission record was removed.', PLAIN_ID);
  database
    .prepare(
      'insert into automation_sequences (id, name, definition, revision, created_at, updated_at) values (?, ?, ?, ?, ?, ?)',
    )
    .run(SEQUENCE_ID, 'Occupied', JSON.stringify(SEQUENCE), 'a'.repeat(64), NOW, NOW);
  database
    .prepare(
      "insert into automation_speech_grants (automation_id, revision, principal, watermark) values (?, 'abc', '{}', 0)",
    )
    .run(STEPS_ID);
  database
    .prepare(
      "insert into harness_effect_authorities (kind, id, profile_id, authorities) values ('sequence', ?, ?, '[]')",
    )
    .run(SEQUENCE_ID, PROFILE);
  const run = database.prepare(
    `insert into automation_runs (id, automation_id, definition_revision, definition, reference_snapshot, owner_profile_id, authority_ids, status, trace, created_at)
     values (?, ?, 'r', '{}', '{}', null, '[]', 'succeeded', '[]', ?)`,
  );
  const owned = database.prepare(
    'insert into automation_run_commands (run_id, command_id) values (?, ?)',
  );
  for (let index = 0; index < AUTOMATION_RUNS_KEPT + 30; index += 1) {
    const id = `2a000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
    run.run(id, STEPS_ID, new Date(Date.parse(NOW) + index * 1000).toISOString());
    owned.run(id, `2b000000-0000-4000-8000-${String(index).padStart(12, '0')}`);
  }
}

type Row = z.infer<typeof ROW>;

function rowOf(rows: ReadonlyMap<string, Row>, id: string): Row {
  const row = rows.get(id);
  if (row === undefined) throw new Error(`The automation ${id} is missing.`);
  return row;
}

function parsedJson(text: string | null): unknown {
  return JSON.parse(text ?? 'null');
}

function expectMovedRows(database: DatabaseSync): void {
  const rows = z
    .array(ROW)
    .parse(
      database
        .prepare(
          'select id, name, enabled, revision, definition, definition_v1, last_error from automations order by name',
        )
        .all(),
    );
  const byId = new Map(rows.map((row) => [row.id, row]));
  const moved = rowOf(byId, STEPS_ID);
  expect(moved).toMatchObject({ enabled: 1, revision: 1, last_error: null });
  expect(parsedJson(moved.definition_v1)).toStrictEqual(PLAIN);
  const parsed = AUTOMATION_V2.parse(parsedJson(moved.definition));
  expect(parsed.when[0]).toMatchObject({ on: 'signal', source: 'device', kind: 'state' });
  expect(parsed.mode).toBe('parallel');
  expect(parsed.steps).toHaveLength(1);
  expect(rowOf(byId, PLAIN_ID).last_error).toBeNull();
  const broken = rowOf(byId, BROKEN_ID);
  expect(broken.enabled).toBe(0);
  expect(broken.last_error).toContain('Not moved to the new automation format');
  expect(parsedJson(broken.definition)).toStrictEqual(WITH_STOP_RUN);
  const sequence = rowOf(byId, SEQUENCE_ID);
  expect(sequence.name).toBe('Occupied (steps 1)');
  const reusable = AUTOMATION_V2.parse(parsedJson(sequence.definition));
  expect(reusable.when).toStrictEqual([]);
  expect(reusable.inputs).toStrictEqual([{ name: 'level', type: 'number' }]);
  expect(reusable.steps.map((step) => step.do)).toStrictEqual(['wait', 'set']);
}

function expectTrimmedRuns(database: DatabaseSync): void {
  const runs = z
    .array(RUN)
    .parse(database.prepare('select id, revision from automation_runs order by created_at').all());
  expect(runs).toHaveLength(AUTOMATION_RUNS_KEPT);
  expect(runs[0]?.id).toBe(`2a000000-0000-4000-8000-${String(30).padStart(12, '0')}`);
  expect(runs.every((run) => run.revision === 1)).toBe(true);
  expect(
    COUNT.parse(database.prepare('select count(*) as count from automation_run_commands').get())
      .count,
  ).toBe(AUTOMATION_RUNS_KEPT);
}

function expectLeftovers(database: DatabaseSync): void {
  expect(
    z
      .array(GRANT)
      .parse(
        database.prepare('select automation_id, revision from automation_speech_grants').all(),
      ),
  ).toStrictEqual([{ automation_id: STEPS_ID, revision: '1' }]);
  expect(
    z.array(KIND).parse(database.prepare('select kind from harness_effect_authorities').all()),
  ).toStrictEqual([{ kind: 'automation' }]);
  expect(
    database.prepare("select name from sqlite_master where name = 'automation_sequences'").all(),
  ).toStrictEqual([]);
  expect(database.prepare('pragma foreign_key_check').all()).toStrictEqual([]);
}

describe('migrating the automations to the v2 model', () => {
  it('moves rows, sequences, runs and grants in one step and keeps what it cannot move', () => {
    const before = build();
    seed(before);
    before.close();
    const reopened = new DatabaseSync(path, { enableForeignKeyConstraints: true });
    migrate(
      new Sql(reopened),
      MIGRATIONS.filter((migration) => migration.version <= BEFORE_V3),
      NOW,
      testLogger(),
    );
    reopened.close();
    const database = new DatabaseSync(path);
    expectMovedRows(database);
    expectTrimmedRuns(database);
    expectLeftovers(database);
    database.close();
  });
});
