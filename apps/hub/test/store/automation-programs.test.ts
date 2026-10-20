import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  EMPTY_LAYOUT,
  type AutomationV3,
  type FunctionV3,
  type JsonValue,
} from '@smarteverything/domain';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import {
  AutomationFunctionsRepository,
  type FunctionRevisionChange,
  type NewFunction,
} from '../../src/store/repositories/automation-functions';
import { AutomationPlansRepository } from '../../src/store/repositories/automation-plans';
import {
  AutomationProgramsRepository,
  type NewAutomationProgram,
} from '../../src/store/repositories/automation-programs';
import { AutomationRevisionsRepository } from '../../src/store/repositories/automation-revisions';
import { Sql, StoreConflictError } from '../../src/store/sql';
import { TEST_AUTHOR } from '../support/automation-author';
import { captureLogs, testLogger } from '../support/logs';

const NODE_A = '3d000000-0000-4000-8000-00000000000a';
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);

const TOTAL = z.object({ total: z.number() });

let clock = new Date('2026-10-18T09:00:00.000Z');
let database: DatabaseSync;
let context: StoreContext;
let programs: AutomationProgramsRepository;
let revisions: AutomationRevisionsRepository;
let functions: AutomationFunctionsRepository;
let plans: AutomationPlansRepository;

function automation(description?: string): AutomationV3 {
  return {
    version: 3,
    kind: 'automation',
    ...(description === undefined ? {} : { description }),
    triggers: [],
    inputs: [],
    outputs: [],
    variables: [],
    body: { nodes: [] },
    policy: { mode: 'single' },
  };
}

function callOf(functionId: string): AutomationV3 {
  return {
    ...automation(),
    body: {
      nodes: [
        {
          id: NODE_A,
          key: 'call',
          kind: 'fn.call',
          ports: { fn: { lit: { function: functionId } } },
        },
      ],
    },
  };
}

function reusable(description?: string): FunctionV3 {
  return {
    version: 3,
    kind: 'function',
    flavour: 'pure',
    ...(description === undefined ? {} : { description }),
    inputs: [],
    outputs: [],
    exits: ['done'],
    variables: [],
    body: { nodes: [] },
  };
}

function newFunction(name: string, program: FunctionV3 = reusable()): NewFunction {
  return {
    name,
    program,
    layout: EMPTY_LAYOUT,
    interfaceHash: HASH_A,
    compat: 'compatible' as const,
    planHash: HASH_B,
    createdBy: null,
    author: TEST_AUTHOR,
  };
}

function revise(
  compat: 'compatible' | 'breaking',
  expectedRevision: number,
): FunctionRevisionChange {
  return {
    program: reusable(),
    layout: EMPTY_LAYOUT,
    interfaceHash: HASH_C,
    compat,
    planHash: HASH_B,
    author: TEST_AUTHOR,
    expectedRevision,
  };
}

function newAutomation(name: string, program: AutomationV3 = automation()): NewAutomationProgram {
  return {
    name,
    enabled: true,
    program,
    layout: EMPTY_LAYOUT,
    planHash: HASH_A,
    origin: null,
    author: TEST_AUTHOR,
  };
}

function count(table: string): number {
  return TOTAL.parse(database.prepare(`select count(*) as total from ${table}`).get()).total;
}

beforeEach(() => {
  captureLogs();
  clock = new Date('2026-10-18T09:00:00.000Z');
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const sql = new Sql(database);
  migrate(sql, MIGRATIONS, clock.toISOString(), testLogger());
  context = new StoreContext(sql, new ChangeFeed(testLogger('store')), () => clock);
  programs = new AutomationProgramsRepository(context);
  revisions = new AutomationRevisionsRepository(context);
  functions = new AutomationFunctionsRepository(context);
  plans = new AutomationPlansRepository(context);
});

describe('the automation program repository', () => {
  it('creates a row at revision 1 with its first revision row', () => {
    const row = programs.create(newAutomation('Lamp'));
    expect(row.revision).toBe(1);
    expect(row.draft).toBeNull();
    expect(row.layout).toStrictEqual(EMPTY_LAYOUT);
    expect(row.definition).toStrictEqual(automation());
    const kept = revisions.byRevision(row.id, 1);
    expect(kept.plan_hash).toBe(HASH_A);
    expect(kept.author).toStrictEqual(TEST_AUTHOR);
    expect(programs.list().map((item) => item.name)).toEqual(['Lamp']);
  });

  it('keeps a draft without moving the revision and checks the expected revision', () => {
    const row = programs.create(newAutomation('Lamp'));
    const drafted = programs.saveDraft(
      row.id,
      { program: automation('changed'), layout: EMPTY_LAYOUT },
      1,
    );
    expect(drafted.revision).toBe(1);
    expect(drafted.draft?.program.description).toBe('changed');
    expect(drafted.definition.description).toBeUndefined();
    expect(() =>
      programs.saveDraft(row.id, { program: automation(), layout: EMPTY_LAYOUT }, 2),
    ).toThrow(/changed since it was read/);
    expect(programs.discardDraft(row.id, 1).draft).toBeNull();
  });

  it('moves a layout without a new revision', () => {
    const row = programs.create(newAutomation('Lamp'));
    const layout = { nodes: { [NODE_A]: { x: 10, y: 20 } }, frames: [], comments: [] };
    const moved = programs.saveLayout(row.id, layout, 1);
    expect(moved.revision).toBe(1);
    expect(moved.layout).toStrictEqual(layout);
    expect(count('automation_revisions')).toBe(1);
  });

  it('publishes the draft as the next revision in one write and clears the draft', () => {
    const row = programs.create(newAutomation('Lamp'));
    programs.saveDraft(row.id, { program: automation('v2'), layout: EMPTY_LAYOUT }, 1);
    const published = programs.publish(row.id, {
      expectedRevision: 1,
      planHash: HASH_B,
      author: TEST_AUTHOR,
    });
    expect(published.revision).toBe(2);
    expect(published.draft).toBeNull();
    expect(published.definition.description).toBe('v2');
    expect(revisions.byRevision(row.id, 2).plan_hash).toBe(HASH_B);
    expect(revisions.byRevision(row.id, 1).definition.description).toBeUndefined();
    expect(revisions.list(row.id).map((item) => item.revision)).toEqual([2, 1]);
    expect(revisions.latest(row.id)?.revision).toBe(2);
  });

  it('refuses to publish without a draft or with a stale revision and changes nothing', () => {
    const row = programs.create(newAutomation('Lamp'));
    const publication = { expectedRevision: 1, planHash: HASH_B, author: null };
    expect(() => programs.publish(row.id, publication)).toThrow(/no draft/);
    programs.saveDraft(row.id, { program: automation('v2'), layout: EMPTY_LAYOUT }, 1);
    expect(() => programs.publish(row.id, { ...publication, expectedRevision: 3 })).toThrow(
      /changed since it was read/,
    );
    expect(programs.byId(row.id).revision).toBe(1);
    expect(count('automation_revisions')).toBe(1);
  });

  it('rolls the whole publish back when the revision row cannot be written', () => {
    const row = programs.create(newAutomation('Lamp'));
    programs.saveDraft(row.id, { program: automation('v2'), layout: EMPTY_LAYOUT }, 1);
    expect(() =>
      programs.publish(row.id, { expectedRevision: 1, planHash: 'not a hash', author: null }),
    ).toThrow(StoreConflictError);
    const after = programs.byId(row.id);
    expect(after.revision).toBe(1);
    expect(after.draft).not.toBeNull();
    expect(after.definition.description).toBeUndefined();
  });

  it('replaces a published program directly, keeps an open draft and clears the last error', () => {
    const row = programs.create(newAutomation('Lamp'));
    programs.saveDraft(row.id, { program: automation('mine'), layout: EMPTY_LAYOUT }, 1);
    database.prepare("update automations set last_error = 'broke' where id = ?").run(row.id);
    const replaced = programs.replace(row.id, {
      program: automation('ai'),
      layout: EMPTY_LAYOUT,
      expectedRevision: 1,
      planHash: HASH_C,
      author: { via: 'assistant', profile_id: TEST_AUTHOR.profile_id },
    });
    expect(replaced.revision).toBe(2);
    expect(replaced.last_error).toBeNull();
    expect(replaced.draft?.program.description).toBe('mine');
    expect(revisions.byRevision(row.id, 2).author?.via).toBe('assistant');
  });

  it('removes the row and its revisions', () => {
    const row = programs.create(newAutomation('Lamp'));
    programs.remove(row.id);
    expect(programs.find(row.id)).toBeUndefined();
    expect(count('automation_revisions')).toBe(0);
    expect(() => programs.byId(row.id)).toThrow(/no automation/);
  });

  it('refuses a row that does not match the v3 contract', () => {
    const row = programs.create(newAutomation('Lamp'));
    database
      .prepare('update automations set definition = \'{"version":2}\' where id = ?')
      .run(row.id);
    expect(() => programs.byId(row.id)).toThrow();
  });
});

describe('the Custom Node repository', () => {
  it('creates a function with revision 1 and the description taken from the program', () => {
    const row = functions.create(newFunction('Dim', reusable('Dims a lamp')));
    expect(row.latest_revision).toBe(1);
    expect(row.description).toBe('Dims a lamp');
    expect(functions.latest(row.id).interface_hash).toBe(HASH_A);
    expect(() => functions.create(newFunction('Dim'))).toThrow(StoreConflictError);
  });

  it('promotes a draft to the next revision', () => {
    const row = functions.create(newFunction('Dim'));
    expect(() =>
      functions.publish(row.id, {
        expectedRevision: 1,
        interfaceHash: HASH_C,
        compat: 'compatible',
        planHash: HASH_B,
        author: null,
      }),
    ).toThrow(/no draft/);
    functions.saveDraft(row.id, { program: reusable('second'), layout: EMPTY_LAYOUT }, 1);
    const published = functions.publish(row.id, {
      expectedRevision: 1,
      interfaceHash: HASH_C,
      compat: 'compatible',
      planHash: HASH_B,
      author: TEST_AUTHOR,
    });
    expect(published.latest_revision).toBe(2);
    expect(published.draft).toBeNull();
    expect(published.description).toBe('second');
    expect(functions.revision(row.id, 2).definition.description).toBe('second');
    expect(functions.revisions(row.id).map((item) => item.revision)).toEqual([2, 1]);
    expect(() => functions.revise(row.id, revise('compatible', 1))).toThrow(
      /changed since it was read/,
    );
  });

  it('resolves the followed revision across compatible saves and stops before a breaking one', () => {
    const row = functions.create(newFunction('Dim'));
    functions.revise(row.id, revise('compatible', 1));
    functions.revise(row.id, revise('breaking', 2));
    functions.revise(row.id, revise('compatible', 3));
    expect(functions.latest(row.id).revision).toBe(4);
    expect(functions.followed(row.id, 1).revision).toBe(2);
    expect(functions.followed(row.id, 2).revision).toBe(2);
    expect(functions.followed(row.id, 3).revision).toBe(4);
    expect(functions.followed(row.id, 4).revision).toBe(4);
  });

  it('lists the automations, drafts and other functions that use a function', () => {
    const used = functions.create(newFunction('Dim'));
    const caller = functions.create(newFunction('Wrap'));
    expect(functions.users(used.id)).toStrictEqual({ automations: [], functions: [] });
    programs.create(newAutomation('Direct', callOf(used.id)));
    const drafted = programs.create(newAutomation('Drafted'));
    programs.saveDraft(drafted.id, { program: callOf(used.id), layout: EMPTY_LAYOUT }, 1);
    programs.create(newAutomation('Other', callOf(caller.id)));
    functions.revise(caller.id, {
      ...revise('compatible', 1),
      program: {
        ...reusable(),
        body: callOf(used.id).body,
      },
    });
    const users = functions.users(used.id);
    expect(users.automations.map((user) => user.name)).toEqual(['Direct', 'Drafted']);
    expect(users.functions.map((user) => user.name)).toEqual(['Wrap']);
  });

  it('refuses to remove a function in use and removes an unused one with its revisions', () => {
    const used = functions.create(newFunction('Dim'));
    programs.create(newAutomation('Direct', callOf(used.id)));
    expect(() => {
      functions.remove(used.id);
    }).toThrow(/Direct uses this Custom Node/);
    const spare = functions.create(newFunction('Spare'));
    functions.remove(spare.id);
    expect(functions.find(spare.id)).toBeUndefined();
    expect(count('automation_function_revisions')).toBe(1);
  });

  it('renames a function and reports a clash', () => {
    const row = functions.create(newFunction('Dim'));
    functions.create(newFunction('Bright'));
    expect(functions.rename(row.id, 'Softer').name).toBe('Softer');
    expect(() => functions.rename(row.id, 'Bright')).toThrow(StoreConflictError);
  });
});

describe('the compiled plan repository', () => {
  const plan: JsonValue = { b: [1, { y: 1, x: 2 }], a: null };

  it('stores a plan once under the hash of its canonical text', () => {
    const hash = plans.put('automation', plan);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(plans.put('automation', { a: null, b: [1, { x: 2, y: 1 }] })).toBe(hash);
    expect(count('automation_plans')).toBe(1);
    expect(plans.has(hash)).toBe(true);
    expect(JSON.parse(plans.find(hash)?.json ?? 'null')).toStrictEqual(plan);
    expect(plans.find(hash)?.kind).toBe('automation');
    expect(plans.has(HASH_C)).toBe(false);
  });

  it('sweeps only the plans no revision or run points at and that are old enough', () => {
    const kept = plans.put('automation', { n: 1 });
    const keptByFunction = plans.put('function', { n: 2 });
    const keptByRun = plans.put('automation', { n: 3 });
    const orphan = plans.put('automation', { n: 4 });
    programs.create({ ...newAutomation('Lamp'), planHash: kept });
    const fn = functions.create({ ...newFunction('Dim'), planHash: keptByFunction });
    expect(fn.latest_revision).toBe(1);
    database
      .prepare(
        "insert into automation_runs (id, automation_id, revision, status, created_at, plan_hash) values ('run-1', ?, 1, 'succeeded', ?, ?)",
      )
      .run(programs.list()[0]?.id ?? '', clock.toISOString(), keptByRun);
    expect(plans.sweepOrphans('2026-10-18T08:00:00.000Z')).toBe(0);
    expect(plans.sweepOrphans('2026-10-18T10:00:00.000Z')).toBe(1);
    expect(plans.has(orphan)).toBe(false);
    for (const hash of [kept, keptByFunction, keptByRun]) expect(plans.has(hash)).toBe(true);
  });
});
