import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { Sql } from '../../src/store/sql';
import { captureLogs, testLogger } from '../support/logs';

const NOW = '2026-10-18T09:00:00.000Z';
const HASH = 'a'.repeat(64);
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
  AUTOMATION_RUN_SUMMARY,
  type AutomationRunSummary,
  type RowOperation,
} from '@smarteverything/domain';
import { AutomationRunRecordsRepository } from '../../src/store/repositories/automation-run-records';

interface Published {
  readonly operation: RowOperation;
  readonly record: AutomationRunSummary;
  readonly oldRecord: AutomationRunSummary | null;
}

let published: Published[];
let runs: AutomationRunRecordsRepository;

const SUMMARY_KEYS = Object.keys(AUTOMATION_RUN_SUMMARY.shape).sort();
const SECRET_STATE = { vars: { token: 'park-state-marker-7781' } };

function start(mode: 'live' | 'dry' = 'live'): string {
  return runs.create({
    automationId: AUTOMATION,
    revision: 1,
    ownerProfileId: null,
    status: 'running',
    mode,
    planHash: HASH,
    trigger: { kind: 'signal', payload: 'trigger-marker-3340' },
    causeChain: [],
  }).id;
}

beforeEach(() => {
  build();
  published = [];
  runs = new AutomationRunRecordsRepository(context, (operation, record, oldRecord) => {
    published.push({ operation, record, oldRecord });
  });
});

describe('automation run records', () => {
  it('creates a run and publishes only the summary shape', () => {
    const id = start();
    const row = runs.byId(id);
    expect(row.status).toBe('running');
    expect(row.mode).toBe('live');
    expect(row.plan_hash).toBe(HASH);
    expect(row.trigger).toStrictEqual({ kind: 'signal', payload: 'trigger-marker-3340' });
    expect(published).toHaveLength(1);
    expect(published[0]?.operation).toBe('INSERT');
    expect(Object.keys(published[0]?.record ?? {}).sort()).toStrictEqual(SUMMARY_KEYS);
  });

  it('keeps what the existing run status source reads on the published row', () => {
    const id = start('dry');
    runs.update(id, { status: 'succeeded', finished_at: NOW });
    const last = published.at(-1);
    expect(last?.operation).toBe('UPDATE');
    expect(last?.record).toMatchObject({
      id,
      automation_id: AUTOMATION,
      status: 'succeeded',
      mode: 'dry',
    });
    expect(last?.oldRecord?.status).toBe('running');
  });

  it('parks a run: state is stored but never appears in the change stream', () => {
    const id = start();
    published = [];
    const parked = runs.park(id, {
      state: SECRET_STATE,
      wakeAt: '2026-10-18T10:00:00.000Z',
      waitingOn: { kind: 'duration', dueAt: '2026-10-18T10:00:00.000Z' },
      activePaths: ['n1'],
    });
    expect(parked.status).toBe('waiting');
    expect(runs.byId(id).state).toStrictEqual(SECRET_STATE);
    expect(published).toHaveLength(1);
    expect(published[0]?.record).toMatchObject({
      status: 'waiting',
      wake_at: '2026-10-18T10:00:00.000Z',
    });
    const text = JSON.stringify(published);
    expect(text).not.toContain('park-state-marker-7781');
    expect(text).not.toContain('trigger-marker-3340');
    expect(text).not.toContain('waiting_on');
    expect(Object.keys(published[0]?.record ?? {}).sort()).toStrictEqual(SUMMARY_KEYS);
  });

  it('publishes nothing when only non-summary fields change', () => {
    const id = start();
    published = [];
    runs.update(id, { state: SECRET_STATE });
    expect(published).toHaveLength(0);
    expect(runs.byId(id).state).toStrictEqual(SECRET_STATE);
  });

  it('resumes a run: state, wake time and wait are cleared together', () => {
    const id = start();
    runs.park(id, {
      state: SECRET_STATE,
      wakeAt: '2026-10-18T10:00:00.000Z',
      waitingOn: { kind: 'duration' },
      activePaths: [],
    });
    const resumed = runs.resume(id);
    expect(resumed).toMatchObject({
      status: 'running',
      state: null,
      wake_at: null,
      waiting_on: null,
    });
    expect(published.at(-1)?.record.status).toBe('running');
  });

  it('finds parked runs that are due', () => {
    const early = start();
    const late = start();
    runs.park(early, {
      state: {},
      wakeAt: '2026-10-18T09:30:00.000Z',
      waitingOn: {},
      activePaths: [],
    });
    runs.park(late, {
      state: {},
      wakeAt: '2026-10-18T12:00:00.000Z',
      waitingOn: {},
      activePaths: [],
    });
    expect(runs.waitingDue('2026-10-18T10:00:00.000Z').map((row) => row.id)).toStrictEqual([early]);
    expect(runs.waiting()).toHaveLength(2);
    expect(runs.active(AUTOMATION)).toHaveLength(2);
  });

  it('lists summaries only, newest first', () => {
    const first = start();
    clock = new Date('2026-10-18T09:05:00.000Z');
    const second = start();
    const listed = runs.summaries(AUTOMATION, 10);
    expect(listed.map((row) => row.id)).toStrictEqual([second, first]);
    expect(Object.keys(listed[0] ?? {}).sort()).toStrictEqual(SUMMARY_KEYS);
    expect(runs.summaries(null, 1)).toHaveLength(1);
  });

  it('forgets finished runs of an automation and keeps active ones', () => {
    const done = start();
    const live = start();
    runs.update(done, { status: 'succeeded', finished_at: NOW });
    expect(runs.forget(AUTOMATION)).toBe(1);
    expect(() => runs.byId(done)).toThrow();
    expect(runs.byId(live).status).toBe('running');
  });

  it('rolls back the row and publishes nothing when the write fails', () => {
    const id = start();
    published = [];
    expect(() => runs.update(id, { status: 'running', started_at: 'not a time' })).toThrow();
    expect(published).toHaveLength(0);
  });
});
