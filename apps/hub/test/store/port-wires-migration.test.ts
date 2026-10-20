import { DatabaseSync } from 'node:sqlite';
import { AUTOMATION_V3, JSON_VALUE } from '@smarteverything/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { wirePortFormulas } from '../../src/store/migrations/port-wires';
import { planHashOf } from '../../src/store/repositories/automation-plans';
import { Sql } from '../../src/store/sql';
import { captureLogs, testLogger } from '../support/logs';

const BEFORE = '2026-10-19T08:00:00.000Z';
const NOW = '2026-10-19T21:00:00.000Z';
const AUTOMATION = '6d000000-0000-4000-8000-000000000001';
const FUNCTION = '6d000000-0000-4000-8000-000000000002';
const DEVICE = '6d000000-0000-4000-8000-000000000003';
const LAST_BEFORE = MIGRATIONS.filter((migration) => migration.version <= 132);

const TEXT = z.object({ text: z.string() });
const VERSION = z.object({ version: z.number() });

const program = (to: object): object => ({
  version: 3,
  kind: 'automation',
  description: 'Scent diffuser on at 07:00 and off at 22:00.',
  triggers: [
    {
      id: '6d000000-0000-4000-8000-000000000011',
      key: 'morning',
      kind: 'trigger.time',
      ports: { at: { lit: '07:00' } },
    },
    {
      id: '6d000000-0000-4000-8000-000000000012',
      key: 'night',
      kind: 'trigger.time',
      ports: { at: { lit: '22:00' } },
    },
  ],
  inputs: [],
  outputs: [],
  variables: [{ name: 'event', type: { t: 'text' }, initial: { lit: 'press' } }],
  body: {
    nodes: [
      {
        id: '6d000000-0000-4000-8000-000000000021',
        key: 'isMorning',
        kind: 'logic.trigger_is',
        ports: { source: { lit: 'morning' } },
      },
      {
        id: '6d000000-0000-4000-8000-000000000022',
        key: 'switch',
        kind: 'device.set',
        ports: { target: { lit: { devices: [DEVICE] } }, control: { lit: 'power' }, to },
      },
    ],
  },
  policy: { mode: 'single' },
});

const plan = (to: object): object => ({
  body: {
    op: 'seq',
    ops: [
      {
        at: { id: '6d000000-0000-4000-8000-000000000022', key: 'switch' },
        kind: 'device.set',
        op: 'effect',
        params: { control: { lit: 'power' }, to },
      },
    ],
  },
  exits: [],
  subject: 'automation',
  variables: [],
  version: 1,
});

const FORMULA = { expr: 'isMorning.result' };
const WIRED = { wire: { from: 'isMorning', port: 'result' } };
const OLD_PLAN = planHashOf(JSON_VALUE.parse(plan(FORMULA)));
const NEW_PLAN = planHashOf(JSON_VALUE.parse(plan(WIRED)));

let database: DatabaseSync;

function run(text: string, ...values: (string | number | null)[]): void {
  database.prepare(text).run(...values);
}

function text(query: string): string {
  return TEXT.parse(database.prepare(query).get()).text;
}

function seed(to: object): void {
  const definition = JSON.stringify(program(to));
  run(
    `insert into automations (id, name, enabled, revision, definition, draft, created_at, updated_at)
     values (?, 'Scent diffusers schedule', 1, 1, ?, ?, ?, ?)`,
    AUTOMATION,
    definition,
    JSON.stringify({ program: program(to), layout: { nodes: {}, frames: [], comments: [] } }),
    BEFORE,
    BEFORE,
  );
  run(
    'insert into automation_plans (hash, kind, json, created_at) values (?, ?, ?, ?)',
    OLD_PLAN,
    'automation',
    JSON.stringify(plan(to)),
    BEFORE,
  );
  run(
    'insert into automation_revisions (automation_id, revision, definition, plan_hash, saved_at) values (?, 1, ?, ?, ?)',
    AUTOMATION,
    definition,
    OLD_PLAN,
    BEFORE,
  );
  run(
    `insert into automation_runs (id, automation_id, revision, status, plan_hash, plan_refs, created_at)
     values ('run-1', ?, 1, 'succeeded', ?, ?, ?)`,
    AUTOMATION,
    OLD_PLAN,
    JSON.stringify([{ id: AUTOMATION, revision: 1, hash: OLD_PLAN }]),
    BEFORE,
  );
  const fn = JSON.stringify({
    version: 3,
    kind: 'function',
    body: { nodes: [{ ports: { on: { expr: 'inputs.allowed' } } }] },
  });
  run(
    `insert into automation_functions (id, name, latest_revision, created_at, updated_at, draft)
     values (?, 'Room lights', 1, ?, ?, ?)`,
    FUNCTION,
    BEFORE,
    BEFORE,
    fn,
  );
  run(
    `insert into automation_function_revisions (function_id, revision, definition, interface_hash, compat, plan_hash, saved_at)
     values (?, 1, ?, ?, 'compatible', ?, ?)`,
    FUNCTION,
    fn,
    'b'.repeat(64),
    OLD_PLAN,
    BEFORE,
  );
}

function prepare(to: object): void {
  captureLogs();
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  migrate(new Sql(database), LAST_BEFORE, BEFORE, testLogger());
  seed(to);
}

describe('the migration that turns plain formulas into wires', () => {
  beforeEach(() => {
    prepare(FORMULA);
    migrate(new Sql(database), MIGRATIONS, NOW, testLogger());
  });

  it('rewrites the program, its draft and its revision to wires the new schema accepts', () => {
    const definition: unknown = JSON.parse(text('select definition as text from automations'));
    expect(AUTOMATION_V3.parse(definition)).toStrictEqual(program(WIRED));
    expect(JSON.parse(text('select draft as text from automations'))).toMatchObject({
      program: program(WIRED),
    });
    expect(JSON.parse(text('select definition as text from automation_revisions'))).toStrictEqual(
      program(WIRED),
    );
  });

  it('rewrites the Custom Node revision and draft, keeping trigger, inputs and vars as wire sources', () => {
    const wired = { wire: { from: 'inputs', port: 'allowed' } };
    for (const query of [
      'select definition as text from automation_function_revisions',
      'select draft as text from automation_functions',
    ]) {
      expect(text(query)).toBe(
        JSON.stringify({
          version: 3,
          kind: 'function',
          body: { nodes: [{ ports: { on: wired } }] },
        }),
      );
    }
  });

  it('stores the compiled plan under its new hash and points every reference at it', () => {
    expect(text('select hash as text from automation_plans')).toBe(NEW_PLAN);
    expect(JSON.parse(text('select json as text from automation_plans'))).toStrictEqual(
      plan(WIRED),
    );
    expect(text('select plan_hash as text from automation_revisions')).toBe(NEW_PLAN);
    expect(text('select plan_hash as text from automation_function_revisions')).toBe(NEW_PLAN);
    expect(text('select plan_hash as text from automation_runs')).toBe(NEW_PLAN);
    expect(text('select plan_refs as text from automation_runs')).toContain(NEW_PLAN);
  });

  it('changes nothing on rows that already hold wires', () => {
    const before = text('select definition as text from automations');
    expect(wirePortFormulas(new Sql(database))).toStrictEqual({ wires: 0 });
    expect(text('select definition as text from automations')).toBe(before);
  });
});

describe('a formula that is not a plain node.port path', () => {
  it.each([
    [{ expr: 'isMorning.result == true' }, 'isMorning.result == true'],
    [{ expr: 'trigger.key.size' }, 'trigger.key.size'],
    [{ tpl: 'Turned on at {{time}}' }, '{"tpl":"Turned on at {{time}}"}'],
  ])('stops the migration and names the automation for %j', (to, shown) => {
    prepare(to);
    const before = text('select definition as text from automations');
    expect(() => migrate(new Sql(database), MIGRATIONS, NOW, testLogger())).toThrow(
      `the automation Scent diffusers schedule (${shown})`,
    );
    expect(text('select definition as text from automations')).toBe(before);
    expect(
      VERSION.parse(database.prepare('select max(version) as version from schema_version').get()),
    ).toStrictEqual({ version: 132 });
  });
});

const TERNARY = { expr: 'trigger.key.startsWith("press") ? "press" : trigger.key' };
const TERNARY_PLAN = planHashOf(JSON_VALUE.parse(plan(TERNARY)));
const UNUSED_PLAN = planHashOf(JSON_VALUE.parse(plan({ tpl: 'on at {{time}}' })));
const ROWS = z.array(z.object({ text: z.string() }));

function texts(query: string): string[] {
  return ROWS.parse(database.prepare(query).all()).map((row) => row.text);
}

function seedOldHistory(): void {
  run('update automations set revision = 2');
  run('update automation_revisions set revision = 2');
  run('update automation_functions set latest_revision = 2');
  run('update automation_function_revisions set revision = 2');
  for (const [hash, to] of [
    [TERNARY_PLAN, TERNARY],
    [UNUSED_PLAN, { tpl: 'on at {{time}}' }],
  ] as const) {
    run(
      `insert into automation_plans (hash, kind, json, created_at) values (?, 'automation', ?, ?)`,
      hash,
      JSON.stringify(plan(to)),
      BEFORE,
    );
  }
  run(
    'insert into automation_revisions (automation_id, revision, definition, plan_hash, saved_at) values (?, 1, ?, ?, ?)',
    AUTOMATION,
    JSON.stringify(program(TERNARY)),
    TERNARY_PLAN,
    BEFORE,
  );
  run(
    `insert into automation_function_revisions (function_id, revision, definition, interface_hash, compat, plan_hash, saved_at)
     values (?, 1, ?, ?, 'compatible', ?, ?)`,
    FUNCTION,
    JSON.stringify({ version: 3, kind: 'function', body: { nodes: [{ ports: { on: TERNARY } }] } }),
    'b'.repeat(64),
    TERNARY_PLAN,
    BEFORE,
  );
  run(
    `insert into automation_runs (id, automation_id, revision, status, plan_hash, created_at)
     values ('run-old', ?, 1, 'succeeded', ?, ?)`,
    AUTOMATION,
    TERNARY_PLAN,
    BEFORE,
  );
  run("insert into automation_run_commands (run_id, command_id) values ('run-old', 'command-old')");
}

describe('old history whose formulas have no wire form', () => {
  beforeEach(() => {
    prepare(FORMULA);
    seedOldHistory();
  });

  it('deletes the old revisions with a ternary formula and keeps the latest ones rewritten', () => {
    migrate(new Sql(database), MIGRATIONS, NOW, testLogger());
    expect(
      texts('select cast(revision as text) as text from automation_revisions order by revision'),
    ).toStrictEqual(['2']);
    expect(
      texts('select cast(revision as text) as text from automation_function_revisions'),
    ).toStrictEqual(['2']);
    expect(JSON.parse(text('select definition as text from automation_revisions'))).toStrictEqual(
      program(WIRED),
    );
  });

  it('deletes their plans, the unused formula plan and the runs that cannot lose their plan', () => {
    migrate(new Sql(database), MIGRATIONS, NOW, testLogger());
    expect(texts('select hash as text from automation_plans')).toStrictEqual([NEW_PLAN]);
    expect(texts('select id as text from automation_runs')).toStrictEqual(['run-1']);
    expect(texts('select run_id as text from automation_run_commands')).toStrictEqual([]);
  });

  it('reports what it deleted and rewrote', () => {
    expect(wirePortFormulas(new Sql(database))).toStrictEqual({
      wires: 6,
      automations: 1,
      automationDrafts: 1,
      automationRevisions: 1,
      automationRevisionsDeleted: 1,
      functionDrafts: 1,
      functionRevisions: 1,
      functionRevisionsDeleted: 1,
      plans: 1,
      plansDeleted: 2,
      runsDeleted: 1,
    });
  });

  it('still stops when a run alone keeps a formula plan alive', () => {
    run(
      `insert into automation_runs (id, automation_id, revision, status, plan_hash, created_at)
     values ('run-unused', ?, 1, 'succeeded', ?, ?)`,
      AUTOMATION,
      UNUSED_PLAN,
      BEFORE,
    );
    expect(() => migrate(new Sql(database), MIGRATIONS, NOW, testLogger())).toThrow(
      'the compiled plan of a run of the automation Scent diffusers schedule',
    );
    expect(
      texts('select cast(revision as text) as text from automation_revisions order by revision'),
    ).toStrictEqual(['1', '2']);
  });
});
