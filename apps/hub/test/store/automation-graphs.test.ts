import {
  copyFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import {
  FUNCTION_V3,
  JSON_VALUE,
  LAYOUT,
  NODE_REGISTRY,
  PROGRAM_V3,
  PROGRAM_V4,
} from '@smarteverything/domain';
import type { FunctionV3, JsonValue, Layout } from '@smarteverything/domain';
import { lower } from '@smarteverything/flow/compile/lower';
import { PLAN, type Plan } from '@smarteverything/flow/compile/plan';
import { interfaceOf } from '@smarteverything/flow/functions/interface-hash';
import { comparePlans } from '@smarteverything/flow/graph/plan-normalise';
import type { Program } from '@smarteverything/flow/program/walk';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  compareTraces,
  runScenario,
  scenariosFor,
  stepDelta,
  type Scenario,
  type Trace,
  type World,
} from '@smarteverything/flow/test/graph/equivalence-harness';
import { functionScenarios } from '@smarteverything/flow/test/graph/equivalence-inputs';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import {
  ProgramConversionError,
  automationGraphsMigration,
  TRACE_EQUALITY_NOTE,
  convertStoredPrograms,
  moveProgramsToGraphs,
  surveyStoredPrograms,
  type ProgramReport,
  type TraceSubject,
  type TraceVerdict,
  type TraceVerifier,
} from '../../src/store/migrations/automation-graphs';
import { SOURCES } from '../../src/store/migrations/automation-graphs-sources';
import { planHashOf } from '../../src/store/repositories/automation-plans';
import { Sql, jsonText } from '../../src/store/sql';
import { captureLogs, testLogger } from '../support/logs';
import { removeStarterNodes } from '../support/starter-nodes';

const NOW = '2026-10-24T09:00:00.000Z';
const CALLEE_ID = '11111111-1111-4111-8111-111111111111';
const STORED_FUNCTION_PLAN = 'f'.repeat(64);
const PARKED_RUN = '99999999-9999-4999-8999-999999999999';
const WORK = fileURLToPath(new URL('../../../../tmp/automations-fixup/90/', import.meta.url));
const COPIES = `${WORK}db-copy/`;
const REPORT = `${WORK}migration-report.json`;

const FIXTURES = [
  'var-chains',
  'if-empty-row',
  'if-empty-else',
  'switch',
  'for-each-collect',
  'repeat',
  'try-catch-finally',
  'parallel-outputs',
  'parallel-if-path',
  'fn-call',
  'snapshot-restore',
  'wait',
  'return-in-if-row',
  'guard-quietly',
  'guard-in-row',
  'values',
] as const;

const OLD_LAYOUT: Layout = {
  nodes: { '14000000-0000-4000-8000-000000000001': { x: 5, y: 7, collapsed: true } },
  frames: [
    {
      id: '15000000-0000-4000-8000-000000000001',
      title: 'Lights',
      color: 'amber',
      nodeIds: ['14000000-0000-4000-8000-000000000001'],
      collapsed: false,
    },
  ],
  comments: [{ id: '15000000-0000-4000-8000-000000000002', text: 'keep me', x: 10, y: 20, w: 200 }],
};

const ROW = z.record(z.string(), z.unknown());

function fixture(name: string): Program {
  const url = new URL(
    `../../../../packages/flow/test/graph/fixtures/${name}.json`,
    import.meta.url,
  );
  return PROGRAM_V3.parse(JSON.parse(readFileSync(url, 'utf8')));
}

function jsonOf(value: unknown): JsonValue {
  return JSON_VALUE.parse(JSON.parse(JSON.stringify(value)));
}

function latestCopy(): string | undefined {
  if (!existsSync(COPIES)) return undefined;
  const found = readdirSync(COPIES)
    .filter((name) => /^live-[\d-]+\.db$/.test(name))
    .sort();
  const latest = found[found.length - 1];
  return latest === undefined ? undefined : `${COPIES}${latest}`;
}

const COPY = latestCopy();
const COPY_TIMEOUT = 240_000;

function calleeFixture(): FunctionV3 {
  return FUNCTION_V3.parse(fixture('fn-callee'));
}

function planOf(tree: Program): Plan {
  const lowered = lower(tree, { kinds: (id) => NODE_REGISTRY.get(id) });
  if (!lowered.ok) throw new Error(JSON.stringify(lowered.problems));
  return lowered.plan;
}

function openMemory(): Sql {
  captureLogs();
  const sql = new Sql(new DatabaseSync(':memory:', { enableForeignKeyConstraints: true }));
  migrate(sql, MIGRATIONS, NOW, testLogger());
  removeStarterNodes(sql);
  return sql;
}

function storePlan(sql: Sql, kind: 'automation' | 'function', plan: Plan): string {
  const hash = planHashOf(jsonOf(plan));
  sql.run(
    'seed a plan',
    `insert into automation_plans (hash, kind, json, created_at) values ($hash, $kind, $json, $now)
     on conflict (hash) do nothing`,
    { hash, kind, json: jsonText(plan), now: NOW },
  );
  return hash;
}

interface Seed {
  readonly id: string;
  readonly name: string;
  readonly tree: Program;
  readonly layout: Layout;
}

function seedAutomation(sql: Sql, { id, name, tree, layout }: Seed): void {
  const hash = storePlan(sql, 'automation', planOf(tree));
  sql.run(
    'seed an automation',
    `insert into automations (id, name, enabled, definition, layout, created_at, updated_at)
     values ($id, $name, 1, $definition, $layout, $now, $now)`,
    { id, name, definition: jsonText(tree), layout: jsonText(layout), now: NOW },
  );
  sql.run(
    'seed a revision',
    `insert into automation_revisions (automation_id, revision, definition, layout, plan_hash, saved_at)
     values ($id, 1, $definition, $layout, $hash, $now)`,
    { id, definition: jsonText(tree), layout: jsonText(layout), hash, now: NOW },
  );
}

function seedFunction(sql: Sql, tree: FunctionV3, hash: string): void {
  sql.run(
    'seed a Custom Node',
    `insert into automation_functions (id, name, latest_revision, created_at, updated_at, draft)
     values ($id, 'Callee', 1, $now, $now, $draft)`,
    { id: CALLEE_ID, now: NOW, draft: jsonText({ program: tree, layout: OLD_LAYOUT }) },
  );
  sql.run(
    'seed a Custom Node revision',
    `insert into automation_function_revisions
       (function_id, revision, definition, layout, interface_hash, compat, plan_hash, saved_at)
     values ($id, 1, $definition, $layout, $interface, 'compatible', $hash, $now)`,
    {
      id: CALLEE_ID,
      definition: jsonText(tree),
      layout: jsonText(OLD_LAYOUT),
      interface: planHashOf(jsonOf(interfaceOf(tree))),
      hash,
      now: NOW,
    },
  );
}

function seedAll(sql: Sql): void {
  FIXTURES.forEach((name, index) => {
    const id = `a0000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
    seedAutomation(sql, { id, name, tree: fixture(name), layout: OLD_LAYOUT });
  });
  const callee = calleeFixture();
  seedFunction(sql, callee, STORED_FUNCTION_PLAN);
  sql.run(
    'seed a stored function plan',
    `insert into automation_plans (hash, kind, json, created_at) values ($hash, 'function', $json, $now)`,
    {
      hash: STORED_FUNCTION_PLAN,
      json: jsonText({ ...planOf(callee), exits: ['done', 'extra'] }),
      now: NOW,
    },
  );
}

function dump(sql: Sql, statements: readonly string[]): readonly unknown[] {
  return statements.map((text) => sql.all(ROW, text));
}

function programRows(sql: Sql): readonly unknown[] {
  return dump(
    sql,
    SOURCES.map((source) => source.select),
  );
}

const PLAN_DATA = [
  'select hash, kind, json, created_at from automation_plans order by hash',
  'select automation_id, revision, plan_hash from automation_revisions order by automation_id, revision',
  'select function_id, revision, plan_hash, interface_hash from automation_function_revisions order by function_id, revision',
  'select id, plan_hash, plan_refs, state, status from automation_runs order by id',
  'select run_id, seq, node_id from automation_run_nodes order by run_id, seq',
  'select automation_id, node_id, state from automation_node_state order by automation_id, node_id',
];

function tickPayload(key: string): Scenario {
  return {
    name: `signal ${key}`,
    trigger: key,
    payload: { key, at: new Date(Date.UTC(2026, 9, 24, 9)).toISOString() },
    inputs: {},
    now: Date.UTC(2026, 9, 24, 9),
  };
}

function scenariosOf(key: string): readonly Scenario[] {
  return key === 'tick' ? scenariosFor('tick') : [tickPayload(key)];
}

function worldOf(tree: Program, callee: FunctionV3 | undefined): World {
  const devices = {
    hall: { power: 'off', level: 0, color: 'white' },
    kitchen: { power: 'off', level: 0 },
    tv: { power: 'on' },
  };
  const variables = Object.fromEntries(
    tree.variables.flatMap((variable) =>
      variable.persist === true && 'lit' in variable.initial
        ? [[variable.name, variable.initial.lit]]
        : [],
    ),
  );
  const base = { devices, variables: { streak: 0, ...variables } };
  if (callee === undefined) return base;
  return { ...base, callee: { id: CALLEE_ID, plan: planOf(callee), shape: interfaceOf(callee) } };
}

function limitation(cause: unknown): string | undefined {
  const message = cause instanceof Error ? cause.message : '';
  return message.startsWith('the fake world') ? message.replace(/\s*\{.*$/s, '') : undefined;
}

function sameNodes(before: Trace, after: Trace): boolean {
  const sorted = (trace: Trace): string =>
    JSON.stringify(trace.nodes.map((node) => JSON.stringify(node)).sort());
  return sorted(before) === sorted(after);
}

function compareAll(subject: TraceSubject, world: World): TraceVerdict {
  const scenarios =
    subject.program.kind === 'automation'
      ? subject.program.triggers.flatMap((trigger) => scenariosOf(trigger.key))
      : functionScenarios(subject.program.inputs);
  if (scenarios.length === 0) {
    return { status: 'skipped', scenarios: 0, stepDeltas: [], reason: 'no trigger to start a run' };
  }
  const differences: string[] = [];
  const stepDeltas: number[] = [];
  for (const scenario of scenarios) {
    const before = runScenario(subject.before, scenario, world);
    const after = runScenario(subject.after, scenario, world);
    stepDeltas.push(stepDelta(before, after));
    const reordered = subject.hoisted && sameNodes(before, after);
    compareTraces(before, after, { ignoreInstant: true })
      .filter((found) => !(reordered && found.field === 'nodes'))
      .forEach((found) => differences.push(`${scenario.name}: ${found.field}`));
  }
  if (differences.length > 0) return { status: 'different', differences };
  return { status: 'equal', scenarios: scenarios.length, stepDeltas };
}

function verifierFor(callee: FunctionV3 | undefined): TraceVerifier {
  return (subject) => {
    try {
      return compareAll(subject, worldOf(subject.program, callee));
    } catch (cause) {
      const reason = limitation(cause);
      if (reason === undefined) throw cause;
      return { status: 'skipped', scenarios: 0, stepDeltas: [], reason };
    }
  };
}

function migrated(sql: Sql, verifier?: TraceVerifier): readonly ProgramReport[] {
  return sql.transaction(() => convertStoredPrograms(sql, verifier)).reports;
}

function graphsIn(sql: Sql): readonly unknown[] {
  return sql.all(ROW, 'select definition, layout from automations').map((row) => ({
    definition: PROGRAM_V4.parse(JSON.parse(String(row['definition']))),
    layout: LAYOUT.parse(JSON.parse(String(row['layout']))),
  }));
}

describe('the move of the stored programs to graphs', () => {
  it('converts every construct fixture, proves it and gives every node a place', () => {
    const sql = openMemory();
    seedAll(sql);
    const reports = migrated(sql, verifierFor(calleeFixture()));
    expect(reports.filter((report) => report.verdict === 'converted')).toHaveLength(
      FIXTURES.length * 2 + 2,
    );
    for (const report of reports) {
      expect(report).toMatchObject({ planEqual: true, canonicalEqual: true });
      expect(report.traces).toMatchObject({ status: 'equal' });
    }
    for (const row of sql.all(ROW, 'select definition, layout from automations')) {
      const graph = PROGRAM_V4.parse(JSON.parse(String(row['definition'])));
      const layout = LAYOUT.parse(JSON.parse(String(row['layout'])));
      const ids = [
        ...graph.nodes.map((node) => node.id),
        ...(graph.kind === 'automation' ? graph.triggers.map((trigger) => trigger.id) : []),
      ];
      expect(ids.filter((id) => layout.nodes[id] === undefined)).toEqual([]);
      expect(layout.comments).toEqual(OLD_LAYOUT.comments);
    }
  });

  it('keeps comments, frames and collapsed marks and drops the old positions', () => {
    const sql = openMemory();
    seedAll(sql);
    migrated(sql);
    const row = sql.all(ROW, "select layout from automations where name = 'guard-quietly'")[0];
    const layout = LAYOUT.parse(JSON.parse(String(row?.['layout'])));
    expect(layout.frames).toEqual(OLD_LAYOUT.frames);
    expect(layout.nodes['14000000-0000-4000-8000-000000000001']).toMatchObject({ collapsed: true });
    expect(layout.nodes['14000000-0000-4000-8000-000000000001']).not.toMatchObject({ x: 5 });
  });

  it('moves drafts, revisions, Custom Node revisions and Custom Node drafts as well', () => {
    const sql = openMemory();
    seedAll(sql);
    const draft = fixture('switch');
    sql.run('seed a draft', 'update automations set draft = $draft where name = $name', {
      name: 'values',
      draft: jsonText({ program: draft, layout: OLD_LAYOUT }),
    });
    migrated(sql);
    const versions = (text: string): unknown[] =>
      sql.all(ROW, text).map((row) => Object.values(row)[0]);
    expect(
      versions(
        "select json_extract(draft, '$.program.version') from automations where draft is not null",
      ),
    ).toEqual([4]);
    expect(
      versions("select json_extract(definition, '$.version') from automation_revisions"),
    ).toEqual(Array.from({ length: FIXTURES.length }, () => 4));
    expect(
      versions("select json_extract(definition, '$.version') from automation_function_revisions"),
    ).toEqual([4]);
    expect(
      versions(
        "select json_extract(draft, '$.program.version') from automation_functions where draft is not null",
      ),
    ).toEqual([4]);
  });

  it('is repeatable: two copies produce identical rows', () => {
    const first = openMemory();
    const second = openMemory();
    seedAll(first);
    seedAll(second);
    migrated(first);
    migrated(second);
    expect(programRows(first)).toEqual(programRows(second));
    expect(graphsIn(first)).toEqual(graphsIn(second));
  });

  it('is applied by the migration runner and leaves a graph that the runner accepts again', () => {
    const sql = openMemory();
    seedAll(sql);
    const migration = automationGraphsMigration(9999);
    migrate(sql, [...MIGRATIONS, migration], NOW, testLogger());
    const after = programRows(sql);
    expect(
      sql.transaction(() => convertStoredPrograms(sql)).reports.map((r) => r.verdict),
    ).not.toContain('converted');
    expect(programRows(sql)).toEqual(after);
  });
});

describe('the registered migration', () => {
  it('says in its log that trace equality is proven on the copy and counts the hoisted programs', () => {
    const sql = openMemory();
    seedAutomation(sql, {
      id: 'a1000000-0000-4000-8000-000000000001',
      name: 'hoisted',
      tree: fixture('return-in-if-row-rest-in-else'),
      layout: OLD_LAYOUT,
    });
    seedAutomation(sql, {
      id: 'a1000000-0000-4000-8000-000000000002',
      name: 'plain',
      tree: fixture('switch'),
      layout: OLD_LAYOUT,
    });
    const payload = sql.transaction(() => moveProgramsToGraphs(sql));
    expect(payload).toMatchObject({ hoisted: 2, traceEquality: TRACE_EQUALITY_NOTE });
    const again = surveyStoredPrograms(sql);
    expect(again.every((report) => report.verdict === 'already-graph')).toBe(true);
  });
});

describe('the abort', () => {
  it('rolls everything back with a named error when the trace differs', () => {
    const sql = openMemory();
    seedAll(sql);
    const before = [programRows(sql), dump(sql, PLAN_DATA)];
    const broken: TraceVerifier = (subject) =>
      subject.owner.includes('wait')
        ? { status: 'different', differences: ['signal tick: effects'] }
        : { status: 'equal', scenarios: 1, stepDeltas: [0] };
    const attempt = (): unknown => sql.transaction(() => convertStoredPrograms(sql, broken));
    expect(attempt).toThrow(ProgramConversionError);
    expect(attempt).toThrow(/the automation wait.*trace equality/);
    expect([programRows(sql), dump(sql, PLAN_DATA)]).toEqual(before);
  });

  it('refuses a program that is not valid and names the automation', () => {
    const sql = openMemory();
    seedAll(sql);
    sql.run(
      'break a program',
      "update automations set definition = '{\"version\":3}' where name = 'switch'",
    );
    const before = programRows(sql);
    expect(() => migrated(sql)).toThrow(/the automation switch cannot move to the graph \(read\)/);
    expect(programRows(sql)).toEqual(before);
  });

  it('names the node of a program whose conversion cannot be lowered', () => {
    const sql = openMemory();
    seedAll(sql);
    const tree = fixture('values');
    const nodes = tree.body.nodes.map((node, index) =>
      index === 0 ? { ...node, kind: 'flow.sequence', scopes: { body: { nodes: [] } } } : node,
    );
    const first = tree.body.nodes[0];
    sql.run(
      'break a program',
      'update automations set definition = $definition where name = $name',
      {
        name: 'values',
        definition: jsonText({ ...tree, body: { nodes } }),
      },
    );
    expect(() => migrated(sql)).toThrow(new RegExp(`values.*${first?.key ?? ''}`));
  });
});

describe('the plans stay put', () => {
  it('leaves plans, plan hashes, run state and kept data byte-identical', () => {
    const sql = openMemory();
    seedAll(sql);
    const state = jsonText({
      planRefs: [{ id: CALLEE_ID, revision: 1, hash: STORED_FUNCTION_PLAN }],
    });
    const waiting = sql.all(
      ROW,
      "select automation_id as id, plan_hash from automation_revisions where automation_id like 'a0000000%' limit 1",
    )[0];
    sql.run(
      'park a run',
      `insert into automation_runs (id, automation_id, revision, status, created_at, plan_hash, plan_refs, state)
       values ($run, $automation, 1, 'waiting', $now, $hash, $refs, $state)`,
      {
        run: PARKED_RUN,
        automation: String(waiting?.['id']),
        now: NOW,
        hash: String(waiting?.['plan_hash']),
        refs: jsonText([{ id: CALLEE_ID, revision: 1, hash: STORED_FUNCTION_PLAN }]),
        state,
      },
    );
    sql.run(
      'keep some data',
      "insert into automation_node_state (automation_id, node_id, partition, state, updated_at) values ($id, 'n', '', '{\"k\":1}', $now)",
      { id: String(waiting?.['id']), now: NOW },
    );
    const before = dump(sql, PLAN_DATA);
    migrated(sql);
    expect(dump(sql, PLAN_DATA)).toEqual(before);
  });

  it('resumes the parked run on its stored plan and resolves the stored function plan', () => {
    const sql = openMemory();
    seedAll(sql);
    migrated(sql);
    const callee = calleeFixture();
    const stored = sql.all(
      ROW,
      `select p.json as json from automation_function_revisions r
       join automation_plans p on p.hash = r.plan_hash where r.function_id = '${CALLEE_ID}'`,
    )[0];
    const plan = PLAN.parse(JSON.parse(String(stored?.['json'])));
    expect(comparePlans(plan, planOf(callee)).equal).toBe(false);
    expect(planHashOf(jsonOf(planOf(callee)))).not.toBe(STORED_FUNCTION_PLAN);
    const revision = sql.all(ROW, 'select plan_hash from automation_function_revisions')[0];
    expect(revision?.['plan_hash']).toBe(STORED_FUNCTION_PLAN);
    const waitRow = sql.all(
      ROW,
      "select p.json as json from automations a join automation_revisions r on r.automation_id = a.id join automation_plans p on p.hash = r.plan_hash where a.name = 'wait'",
    )[0];
    const resumed = runScenario(
      PLAN.parse(JSON.parse(String(waitRow?.['json']))),
      scenariosFor('tick')[0] ?? tickPayload('tick'),
      worldOf(fixture('wait'), undefined),
    );
    expect(resumed.outcome.kind).toBe('done');
  });
});

function migratedCopy(source: string, suffix: string): readonly unknown[] {
  const path = source.replace(/\.db$/, `-work-${suffix}.db`);
  rmSync(`${path}-wal`, { force: true });
  rmSync(`${path}-shm`, { force: true });
  copyFileSync(source, path);
  const sql = new Sql(new DatabaseSync(path, { enableForeignKeyConstraints: true }));
  try {
    const plans = dump(sql, PLAN_DATA);
    migrated(sql);
    expect(dump(sql, PLAN_DATA)).toEqual(plans);
    return programRows(sql);
  } finally {
    sql.database.close();
    rmSync(path);
    rmSync(`${path}-wal`, { force: true });
    rmSync(`${path}-shm`, { force: true });
  }
}

describe.skipIf(COPY === undefined)('a copy of the live database', () => {
  it(
    'proves every stored program and writes the report',
    () => {
      if (COPY === undefined) return;
      const database = new DatabaseSync(COPY, { readOnly: true });
      const reports = surveyStoredPrograms(new Sql(database), verifierFor(undefined));
      database.close();
      writeFileSync(REPORT, `${JSON.stringify(reports, null, 2)}\n`);
      expect(reports.length).toBeGreaterThan(0);
      expect(reports.filter((report) => report.verdict === 'failed').map((r) => r.owner)).toEqual(
        [],
      );
    },
    COPY_TIMEOUT,
  );

  it(
    'moves two copies to identical graphs without touching plan data',
    () => {
      if (COPY === undefined) return;
      expect(migratedCopy(COPY, 'a')).toEqual(migratedCopy(COPY, 'b'));
    },
    COPY_TIMEOUT,
  );
});
