import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { sweepRetention } from '../../src/store/retention';
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
import { z } from 'zod';
import {
  NODE_BYTES_PER_AUTOMATION,
  orphanPlans,
  planRunRetention,
  sweepAutomationRetention,
  type RunRetentionFact,
} from '../../src/store/retention-automations';
import {
  AUTOMATION_STORAGE_TABLES,
  automationStorageMetrics,
} from '../../src/store/automation-storage-metrics';
import { AutomationRunRecordsRepository } from '../../src/store/repositories/automation-run-records';

const DAY = 86_400_000;
const NOW_DATE = new Date(NOW);

function ago(days: number): string {
  return new Date(NOW_DATE.getTime() - days * DAY).toISOString();
}

function fact(id: string, overrides: Partial<RunRetentionFact> = {}): RunRetentionFact {
  return {
    id,
    automationId: AUTOMATION,
    status: 'succeeded',
    mode: 'live',
    endedAt: ago(1),
    nodeBytes: 0,
    ...overrides,
  };
}

describe('the run retention rules', () => {
  it('keeps successful live runs 30 days and troubled ones 90', () => {
    const plan = planRunRetention(
      [
        fact('ok-new', { endedAt: ago(29) }),
        fact('ok-old', { endedAt: ago(31) }),
        fact('failed-mid', { status: 'failed', endedAt: ago(60) }),
        fact('failed-old', { status: 'failed', endedAt: ago(91) }),
        fact('cancelled-old', { status: 'cancelled', endedAt: ago(91) }),
        fact('interrupted-mid', { status: 'interrupted', endedAt: ago(89) }),
      ],
      NOW_DATE,
    );
    expect([...plan.forgetRuns].sort()).toStrictEqual(['cancelled-old', 'failed-old', 'ok-old']);
  });

  it('keeps dry and simulated runs 7 days whatever their outcome', () => {
    const plan = planRunRetention(
      [
        fact('dry-old', { mode: 'dry', endedAt: ago(8) }),
        fact('sim-failed-old', { mode: 'simulated', status: 'failed', endedAt: ago(8) }),
        fact('dry-new', { mode: 'dry', endedAt: ago(6) }),
      ],
      NOW_DATE,
    );
    expect([...plan.forgetRuns].sort()).toStrictEqual(['dry-old', 'sim-failed-old']);
  });

  it('never forgets a run that is still active', () => {
    const plan = planRunRetention(
      ['queued', 'running', 'waiting', 'paused', 'cancelling'].map((status) =>
        fact(status, {
          status: z.enum(['queued', 'running', 'waiting', 'paused', 'cancelling']).parse(status),
          endedAt: ago(400),
        }),
      ),
      NOW_DATE,
    );
    expect(plan.forgetRuns).toStrictEqual([]);
  });

  it('drops node records of the oldest successful runs first over 20 MiB', () => {
    const slab = 8 * 1024 * 1024;
    const plan = planRunRetention(
      [
        fact('a', { endedAt: ago(5), nodeBytes: slab }),
        fact('b', { endedAt: ago(4), nodeBytes: slab }),
        fact('c', { endedAt: ago(3), nodeBytes: slab }),
        fact('failed', { status: 'failed', endedAt: ago(10), nodeBytes: slab }),
      ],
      NOW_DATE,
    );
    expect(plan.dropNodes).toStrictEqual(['a', 'b']);
    expect(plan.forgetRuns).toStrictEqual([]);
  });

  it('counts the ceiling per automation and falls back to failed runs last', () => {
    const slab = NODE_BYTES_PER_AUTOMATION;
    const plan = planRunRetention(
      [
        fact('x-ok', { endedAt: ago(2), nodeBytes: slab }),
        fact('x-failed', { status: 'failed', endedAt: ago(9), nodeBytes: slab }),
        fact('y-ok', { automationId: OTHER, endedAt: ago(2), nodeBytes: slab }),
      ],
      NOW_DATE,
    );
    expect(plan.dropNodes).toStrictEqual(['x-ok']);
  });

  it('names plans nothing refers to', () => {
    expect(orphanPlans(['p1', 'p2', 'p3'], new Set(['p2']))).toStrictEqual(['p1', 'p3']);
  });
});

describe('the run retention sweep', () => {
  let runs: AutomationRunRecordsRepository;

  function insertPlan(hash: string, createdAt: string): void {
    sql.run(
      'seed a plan',
      "insert into automation_plans(hash,kind,json,created_at) values($hash,'automation','{}',$createdAt)",
      { hash, createdAt },
    );
  }

  function finished(
    createdAt: string,
    status: 'succeeded' | 'failed',
    mode: 'live' | 'dry' = 'live',
  ): string {
    const id = runs.create({
      automationId: AUTOMATION,
      revision: 1,
      ownerProfileId: null,
      mode,
      planHash: HASH,
    }).id;
    sql.run(
      'age a run',
      'update automation_runs set status=$status, created_at=$at, finished_at=$at where id=$id',
      { id, status, at: createdAt },
    );
    return id;
  }

  beforeEach(() => {
    build();
    runs = new AutomationRunRecordsRepository(context, () => undefined);
  });

  it('forgets old runs with their node records and commands, and keeps the rest', () => {
    const old = finished(ago(40), 'succeeded');
    const troubled = finished(ago(40), 'failed');
    finished(ago(8), 'succeeded', 'dry');
    const fresh = finished(ago(1), 'succeeded');
    sql.run(
      'seed a node record',
      "insert into automation_run_nodes(run_id,seq,path,node_id,status,command_ids) values($id,0,'p','3d000000-0000-4000-8000-000000000001','succeeded','[]')",
      { id: old },
    );
    const swept = sweepAutomationRetention(sql, NOW_DATE);
    expect(swept['automation_runs']).toBe(2);
    const left = sql.all(
      z.strictObject({ id: z.string() }),
      'select id from automation_runs order by id',
    );
    expect(left.map((row) => row.id).sort()).toStrictEqual([troubled, fresh].sort());
    expect(
      sql.get(z.strictObject({ n: z.int() }), 'select count(*) as n from automation_run_nodes')?.n,
    ).toBe(0);
  });

  it('drops node records over the ceiling but keeps the run summary', () => {
    const id = finished(ago(1), 'succeeded');
    const blob = 'x'.repeat(1024 * 1024);
    for (let seq = 0; seq < 22; seq += 1)
      sql.run(
        'seed a big node record',
        "insert into automation_run_nodes(run_id,seq,path,node_id,status,output_preview,command_ids) values($id,$seq,'p','3d000000-0000-4000-8000-000000000001','succeeded',json_object('v',$blob),'[]')",
        { id, seq, blob },
      );
    const swept = sweepAutomationRetention(sql, NOW_DATE);
    expect(swept['automation_run_nodes']).toBe(22);
    expect(runs.byId(id).status).toBe('succeeded');
  });

  it('sweeps old decisions and orphan plans past their grace period only', () => {
    sql.run(
      'seed a decision',
      "insert into automation_decisions(automation_id,window_start,reason,count,first_at,last_at) values($a,$at,'storm',1,$at,$at)",
      { a: AUTOMATION, at: ago(31) },
    );
    sql.run(
      'seed a decision',
      "insert into automation_decisions(automation_id,window_start,reason,count,first_at,last_at) values($a,$at,'storm',1,$at,$at)",
      { a: AUTOMATION, at: ago(2) },
    );
    const kept = 'b'.repeat(64);
    const used = 'c'.repeat(64);
    const young = 'd'.repeat(64);
    const orphan = 'e'.repeat(64);
    insertPlan(kept, ago(5));
    insertPlan(used, ago(5));
    insertPlan(young, ago(0.1));
    insertPlan(orphan, ago(5));
    sql.run(
      'seed a revision',
      "insert into automation_revisions(automation_id,revision,definition,plan_hash,saved_at) values($a,1,'{}',$h,$at)",
      { a: AUTOMATION, h: kept, at: NOW },
    );
    runs.create({
      automationId: AUTOMATION,
      revision: 1,
      ownerProfileId: null,
      mode: 'live',
      planHash: used,
    });
    const swept = sweepAutomationRetention(sql, NOW_DATE);
    expect(swept['automation_decisions']).toBe(1);
    expect(swept['automation_plans']).toBe(1);
    const hashes = sql.all(
      z.strictObject({ hash: z.string() }),
      'select hash from automation_plans',
    );
    expect(hashes.map((row) => row.hash).sort()).toStrictEqual([kept, used, young].sort());
  });
});

describe('the automation storage metrics', () => {
  beforeEach(build);

  it('names only tables the schema created', () => {
    const names = sql
      .all(
        z.strictObject({ name: z.string() }),
        "select name from sqlite_master where type='table'",
      )
      .map((row) => row.name);
    for (const table of AUTOMATION_STORAGE_TABLES) expect(names).toContain(table);
  });

  it('reports zero for empty tables and grows with rows', () => {
    const empty = automationStorageMetrics(sql);
    expect(empty.map((entry) => entry.table)).toStrictEqual([...AUTOMATION_STORAGE_TABLES]);
    expect(empty.every((entry) => entry.rows === 0 && entry.bytes === 0)).toBe(true);
    sql.run(
      'seed a plan',
      "insert into automation_plans(hash,kind,json,created_at) values($h,'automation','{\"a\":1}',$at)",
      { h: HASH, at: NOW },
    );
    const plans = automationStorageMetrics(sql).find((entry) => entry.table === 'automation_plans');
    expect(plans?.rows).toBe(1);
    expect(plans?.bytes).toBeGreaterThanOrEqual(64 + 10);
  });
});

describe('the store retention sweep', () => {
  beforeEach(build);

  it('includes the automation rules next to the other aged tables', () => {
    sql.run(
      'seed an orphan plan',
      "insert into automation_plans(hash,kind,json,created_at) values($h,'automation','{}',$at)",
      { h: HASH, at: ago(3) },
    );
    const swept = sweepRetention(sql, NOW_DATE);
    expect(swept['automation_plans']).toBe(1);
    expect(swept).toHaveProperty('automation_runs');
    expect(swept).toHaveProperty('ai_wakes');
  });
});
