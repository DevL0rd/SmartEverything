import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { beforeEach, describe, expect, it } from 'vitest';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { Sql } from '../../src/store/sql';
import { captureLogs, testLogger } from '../support/logs';

const NOW = '2026-10-18T09:00:00.000Z';
const AUTOMATION = '3a000000-0000-4000-8000-000000000001';
const OTHER = '3a000000-0000-4000-8000-000000000002';

let sql: Sql;
let context: StoreContext;
let clock = new Date(NOW);

function build(): void {
  captureLogs();
  clock = new Date(NOW);
  const database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  sql = new Sql(database);
  migrate(sql, MIGRATIONS, NOW, testLogger());
  context = new StoreContext(sql, new ChangeFeed(testLogger('store')), () => clock);
  for (const id of [AUTOMATION, OTHER])
    database
      .prepare(
        'insert into automations (id, name, enabled, definition, run_count, created_at, updated_at) values (?, ?, 1, ?, 0, ?, ?)',
      )
      .run(id, 'Lamp ' + id.slice(-1), '{"when":[],"steps":[]}', NOW, NOW);
}
import {
  AutomationDecisionsRepository,
  decisionWindowStart,
} from '../../src/store/repositories/automation-decisions';
import { AutomationNodeStateRepository } from '../../src/store/repositories/automation-node-state';
import { AutomationOwnedValuesRepository } from '../../src/store/repositories/automation-owned-values';
import { AutomationTestsRepository } from '../../src/store/repositories/automation-tests';

const NODE = '3d000000-0000-4000-8000-000000000001';

beforeEach(build);

describe('automation decisions', () => {
  it('floors a moment to its minute window', () => {
    expect(decisionWindowStart('2026-10-18T09:00:42.500Z')).toBe('2026-10-18T09:00:00.000Z');
  });

  it('counts drops per minute window and reason, keeping the first detail', () => {
    const decisions = new AutomationDecisionsRepository(context);
    decisions.record({
      automationId: AUTOMATION,
      reason: 'single_busy',
      at: '2026-10-18T09:00:10.000Z',
      detail: { by: 'run-1' },
    });
    decisions.record({
      automationId: AUTOMATION,
      reason: 'single_busy',
      at: '2026-10-18T09:00:50.000Z',
      detail: { by: 'run-2' },
    });
    decisions.record({
      automationId: AUTOMATION,
      reason: 'storm',
      at: '2026-10-18T09:00:20.000Z',
      times: 5,
    });
    decisions.record({
      automationId: AUTOMATION,
      reason: 'single_busy',
      at: '2026-10-18T09:01:05.000Z',
    });
    const rows = decisions.forAutomation(AUTOMATION, null, 10);
    expect(rows).toHaveLength(3);
    const busy = rows.find(
      (row) => row.reason === 'single_busy' && row.window_start === '2026-10-18T09:00:00.000Z',
    );
    expect(busy).toMatchObject({
      count: 2,
      first_at: '2026-10-18T09:00:10.000Z',
      last_at: '2026-10-18T09:00:50.000Z',
      detail: { by: 'run-1' },
    });
    expect(rows.find((row) => row.reason === 'storm')?.count).toBe(5);
    expect(decisions.forAutomation(AUTOMATION, '2026-10-18T09:01:00.000Z', 10)).toHaveLength(1);
    expect(decisions.forAutomation(OTHER, null, 10)).toHaveLength(0);
  });

  it('sweeps old windows', () => {
    const decisions = new AutomationDecisionsRepository(context);
    decisions.record({ automationId: AUTOMATION, reason: 'stale', at: '2026-09-01T00:00:00.000Z' });
    decisions.record({ automationId: AUTOMATION, reason: 'stale', at: NOW });
    expect(decisions.sweepBefore('2026-10-01T00:00:00.000Z')).toBe(1);
    expect(decisions.forAutomation(AUTOMATION, null, 10)).toHaveLength(1);
  });
});

describe('automation node state', () => {
  it('saves, replaces and reads state per partition', () => {
    const states = new AutomationNodeStateRepository(context);
    states.save({ automationId: AUTOMATION, nodeId: NODE, state: { count: 1 } });
    states.save({ automationId: AUTOMATION, nodeId: NODE, partition: 'room', state: [1, 2] });
    clock = new Date('2026-10-18T09:10:00.000Z');
    const replaced = states.save({ automationId: AUTOMATION, nodeId: NODE, state: { count: 2 } });
    expect(replaced).toMatchObject({ state: { count: 2 }, updated_at: '2026-10-18T09:10:00.000Z' });
    expect(states.get(AUTOMATION, NODE, 'room')?.state).toStrictEqual([1, 2]);
    expect(states.get(AUTOMATION, NODE, 'other')).toBeUndefined();
    expect(states.forAutomation(AUTOMATION)).toHaveLength(2);
  });

  it('finds due wake times and clears them', () => {
    const states = new AutomationNodeStateRepository(context);
    states.save({
      automationId: AUTOMATION,
      nodeId: NODE,
      state: 1,
      wakeAt: '2026-10-18T09:30:00.000Z',
    });
    states.save({
      automationId: OTHER,
      nodeId: NODE,
      state: 1,
      wakeAt: '2026-10-18T12:00:00.000Z',
    });
    expect(
      states.dueWakes('2026-10-18T10:00:00.000Z').map((row) => row.automation_id),
    ).toStrictEqual([AUTOMATION]);
    states.clearWake(AUTOMATION, NODE);
    expect(states.dueWakes('2026-10-18T10:00:00.000Z')).toHaveLength(0);
    expect(states.get(AUTOMATION, NODE)?.state).toBe(1);
  });

  it('forgets removed nodes and follows the automation on delete', () => {
    const states = new AutomationNodeStateRepository(context);
    const gone = '3d000000-0000-4000-8000-000000000002';
    states.save({ automationId: AUTOMATION, nodeId: NODE, state: 1 });
    states.save({ automationId: AUTOMATION, nodeId: gone, state: 1 });
    expect(states.keepOnly(AUTOMATION, [NODE])).toBe(1);
    expect(states.remove(AUTOMATION, NODE)).toBe(1);
    states.save({ automationId: AUTOMATION, nodeId: NODE, state: 1 });
    sql.run('remove the automation', 'delete from automations where id=$id', { id: AUTOMATION });
    expect(states.forAutomation(AUTOMATION)).toHaveLength(0);
  });

  it('refuses state that is not JSON', () => {
    const states = new AutomationNodeStateRepository(context);
    expect(() => states.save({ automationId: AUTOMATION, nodeId: NODE, state: () => 1 })).toThrow();
  });
});

describe('automation tests', () => {
  it('saves, updates, lists and removes tests of an automation', () => {
    const tests = new AutomationTestsRepository(context);
    const saved = tests.save({ automationId: AUTOMATION, name: 'Night', scenario: { start: NOW } });
    expect(saved.expectations).toStrictEqual([]);
    clock = new Date('2026-10-18T09:05:00.000Z');
    const changed = tests.save({
      automationId: AUTOMATION,
      id: saved.id,
      name: 'Night run',
      scenario: { start: NOW },
      expectations: [{ kind: 'ran' }],
    });
    expect(changed).toMatchObject({
      id: saved.id,
      name: 'Night run',
      updated_at: '2026-10-18T09:05:00.000Z',
    });
    tests.save({ automationId: OTHER, name: 'Other', scenario: {} });
    expect(tests.list(AUTOMATION)).toHaveLength(1);
    tests.remove(AUTOMATION, saved.id);
    expect(() => tests.byId(AUTOMATION, saved.id)).toThrow();
  });

  it('rejects an empty name and goes with the automation on delete', () => {
    const tests = new AutomationTestsRepository(context);
    expect(() => tests.save({ automationId: AUTOMATION, name: '  ', scenario: {} })).toThrow();
    tests.save({ automationId: AUTOMATION, name: 'Keep', scenario: {} });
    sql.run('remove the automation', 'delete from automations where id=$id', { id: AUTOMATION });
    expect(tests.list(AUTOMATION)).toHaveLength(0);
  });
});

describe('owned automation Values', () => {
  it('holds text, instant and typed Values owned by one automation', () => {
    const values = new AutomationOwnedValuesRepository(context);
    const text = values.create(AUTOMATION, { kind: 'text', name: 'Mode', value: 'night' });
    values.create(AUTOMATION, { kind: 'instant', name: 'Last seen', value: null });
    values.create(AUTOMATION, {
      kind: 'typed',
      name: 'Levels',
      type: { t: 'list', of: { t: 'number' } },
      value: [1, 2],
    });
    values.create(OTHER, { kind: 'text', name: 'Mode', value: 'day' });
    expect(
      values
        .list(AUTOMATION)
        .map((row) => row.content.kind)
        .sort(),
    ).toStrictEqual(['instant', 'text', 'typed']);
    expect(values.list(OTHER)).toHaveLength(1);
    expect(() => values.byId(OTHER, text.id)).toThrow();
  });

  it('changes a Value with revision checks and a fixed kind', () => {
    const values = new AutomationOwnedValuesRepository(context);
    const row = values.create(AUTOMATION, { kind: 'text', name: 'Mode', value: 'night' });
    const next = values.write(AUTOMATION, row.id, { kind: 'text', name: 'Mode', value: 'day' }, 1);
    expect(next).toMatchObject({ revision: 2, content: { value: 'day' } });
    expect(() =>
      values.write(AUTOMATION, row.id, { kind: 'text', name: 'Mode', value: 'x' }, 1),
    ).toThrow(/changed/);
    expect(() =>
      values.write(AUTOMATION, row.id, { kind: 'instant', name: 'Mode', value: null }),
    ).toThrow(/kind/);
    expect(() => values.write(OTHER, row.id, { kind: 'text', name: 'Mode', value: 'x' })).toThrow();
  });

  it('removes one Value, and all of them with the automation', () => {
    const values = new AutomationOwnedValuesRepository(context);
    const one = values.create(AUTOMATION, { kind: 'text', name: 'A', value: '1' });
    values.create(AUTOMATION, { kind: 'text', name: 'B', value: '2' });
    values.create(OTHER, { kind: 'text', name: 'C', value: '3' });
    values.remove(AUTOMATION, one.id);
    expect(values.list(AUTOMATION)).toHaveLength(1);
    sql.run('remove the automation', 'delete from automations where id=$id', { id: AUTOMATION });
    expect(values.list(AUTOMATION)).toHaveLength(0);
    expect(values.list(OTHER)).toHaveLength(1);
  });

  it('leaves home-scope Values without an owner untouched', () => {
    const values = new AutomationOwnedValuesRepository(context);
    sql.run(
      'seed a home Value',
      'insert into automation_values(id,content,revision,created_at,updated_at) values(\'3e000000-0000-4000-8000-000000000001\',\'{"kind":"boolean","name":"Home","value":true}\',1,$now,$now)',
      { now: NOW },
    );
    values.create(AUTOMATION, { kind: 'text', name: 'A', value: '1' });
    expect(values.forget(AUTOMATION)).toBe(1);
    const left = sql.get(
      z.strictObject({ n: z.int() }),
      'select count(*) as n from automation_values',
    );
    expect(left?.n).toBe(1);
  });
});
