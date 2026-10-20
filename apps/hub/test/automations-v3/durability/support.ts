import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { JSON_VALUE } from '@smarteverything/domain';
import type { AutomationRunRecord } from '@smarteverything/domain';
import type { Plan, PlanOp } from '@smarteverything/flow/compile/plan';
import { CORE_FRAMES, CORE_OPS } from '@smarteverything/flow/interpret/core-ops';
import type { Evaluated, NodeResult, StepContext } from '@smarteverything/flow/interpret/frames';
import { rootFrame } from '@smarteverything/flow/interpret/frames';
import { LOOP_FRAMES, LOOP_OPS } from '@smarteverything/flow/interpret/loops';
import { TRY_FRAMES, TRY_OPS } from '@smarteverything/flow/interpret/try';
import { waitOps } from '@smarteverything/flow/interpret/waits';
import type { WaitResume } from '@smarteverything/flow/interpret/waits';
import { resolveBudgets, startBudgets } from '@smarteverything/flow/state/budgets';
import type { RunState, Wait } from '@smarteverything/flow/state/run-state';
import { RunDriver } from '../../../src/automations/driver/admission';
import { bootRuns } from '../../../src/automations/driver/boot';
import type { BootReport } from '../../../src/automations/driver/boot';
import type { DriverPorts, RunStart } from '../../../src/automations/driver/ports';
import { RunParkStore } from '../../../src/automations/driver/park-store';
import { StoreContext } from '../../../src/store/context';
import { ChangeFeed } from '../../../src/store/feed';
import { migrate } from '../../../src/store/migrate';
import { MIGRATIONS } from '../../../src/store/migrations';
import { AutomationPlansRepository } from '../../../src/store/repositories/automation-plans';
import { AutomationRunRecordsRepository } from '../../../src/store/repositories/automation-run-records';
import { Sql } from '../../../src/store/sql';
import { SimulatedClock as TestClock } from '../../../src/clock/simulated';
import { captureLogs, testLogger } from '../../support/logs';

const START = '2026-10-18T12:00:00.000Z';

export const SECOND = 1000;

const MINUTE = 60 * SECOND;

export { MINUTE };

export function at(key: string): { id: string; key: string } {
  return { id: randomUUID(), key };
}

export function seq(...ops: PlanOp[]): PlanOp {
  return { op: 'seq', ops };
}

export function effect(key: string): PlanOp {
  return {
    op: 'effect',
    at: at(key),
    kind: 'test.effect',
    params: {},
    retry: 'idempotent',
    budget: 'none',
  };
}

export type IfLate = 'run' | 'skip' | 'fail';

export function sleep(
  key: string,
  milliseconds: number,
  options: { durable?: boolean; ifLate?: IfLate } = {},
): PlanOp {
  return {
    op: 'wait',
    at: at(key),
    durable: options.durable ?? true,
    wait: { kind: 'duration', duration: { lit: milliseconds }, ifLate: options.ifLate ?? 'run' },
  };
}

export function level(key: string, timeoutMs?: number): PlanOp {
  return {
    op: 'wait',
    at: at(key),
    durable: true,
    wait: {
      kind: 'condition',
      condition: { wire: { from: 'home', port: 'level' } },
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
    },
  };
}

export function polling(key: string, gapMs: number, limitMs: number, body: PlanOp): PlanOp {
  return {
    op: 'loop',
    at: at(key),
    source: { kind: 'count', times: { lit: 1000 } },
    entryTest: false,
    order: 'gap_then_test',
    gap: { ms: gapMs, skipAfterLast: false, clipToDeadline: false },
    limit: { time: limitMs, onLimit: 'end', note: 'stopped by the loop time limit' },
    body,
  };
}

export class Home {
  level = false;
  readonly effects: string[] = [];
  readonly watched: { wait: Wait; resume: (resume: WaitResume) => void; cancelled: boolean }[] = [];
}

function contextOf(body: PlanOp, home: Home): StepContext {
  const plan: Plan = { version: 1, subject: 'automation', exits: [], variables: [], body };
  return {
    plan: () => plan,
    pure: () => undefined,
    reads: {
      node: (): NodeResult => ({ ok: true, value: {} }),
      variable: (): Evaluated => ({ ok: true, value: 0 }),
    },
    changeVar: () => ({ ok: true, value: { value: 0, wrapped: false } }),
    limits: resolveBudgets(),
    home: {
      get level(): boolean {
        return home.level;
      },
    },
    ops: {
      ...CORE_OPS,
      ...TRY_OPS,
      ...LOOP_OPS,
      ...waitOps({ nextOccurrence: () => ({ ok: true, value: 0 }) }),
    },
    frames: { ...CORE_FRAMES, ...TRY_FRAMES, ...LOOP_FRAMES },
  };
}

export interface Database {
  readonly sql: Sql;
  readonly context: StoreContext;
  readonly clock: TestClock;
  readonly records: AutomationRunRecordsRepository;
  readonly plans: AutomationPlansRepository;
  readonly bodies: Map<string, PlanOp>;
  readonly enabled: Set<string>;
}

export function database(): Database {
  captureLogs();
  const clock = new TestClock(START);
  const raw = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const sql = new Sql(raw);
  migrate(sql, MIGRATIONS, START, testLogger());
  const context = new StoreContext(sql, new ChangeFeed(testLogger('store')), () => clock.now());
  return {
    sql,
    context,
    clock,
    records: new AutomationRunRecordsRepository(context, () => undefined),
    plans: new AutomationPlansRepository(context),
    bodies: new Map(),
    enabled: new Set(),
  };
}

export function addAutomation(db: Database, body: PlanOp): { id: string; hash: string } {
  const id = randomUUID();
  const now = db.clock.now().toISOString();
  db.sql.run(
    'add a test automation',
    'insert into automations (id, name, enabled, definition, run_count, created_at, updated_at) values ($id, $name, 1, $definition, 0, $now, $now)',
    { id, name: `Durable test ${id}`, definition: '{"when":[],"steps":[]}', now },
  );
  const plan: Plan = { version: 1, subject: 'automation', exits: [], variables: [], body };
  const hash = db.plans.put('automation', JSON_VALUE.parse(JSON.parse(JSON.stringify(plan))));
  db.bodies.set(id, body);
  db.enabled.add(id);
  return { id, hash };
}

export class Hub {
  readonly requests: string[] = [];
  readonly finished: { runId: string; status: string }[] = [];
  readonly driver: RunDriver;
  readonly parks: RunParkStore;
  report: BootReport | undefined;

  constructor(
    readonly db: Database,
    readonly home: Home,
  ) {
    this.parks = new RunParkStore(db.records, db.clock);
    this.driver = new RunDriver({
      ports: this.ports(),
      decisions: { record: (): void => undefined },
      yieldNow: (resume): void => {
        this.yields.push(resume);
      },
    });
  }

  private readonly yields: (() => void)[] = [];

  async settle(): Promise<void> {
    for (let round = 0; round < 40; round += 1) {
      await Promise.resolve();
      for (const resume of this.yields.splice(0)) resume();
    }
  }

  async advance(milliseconds: number): Promise<void> {
    this.db.clock.advanceTo(new Date(this.db.clock.now().getTime() + milliseconds).toISOString());
    await this.settle();
  }

  boot(): BootReport {
    this.report = bootRuns({
      records: this.db.records,
      plans: this.db.plans,
      clock: this.db.clock,
      driver: this.driver,
      parks: this.parks,
      enabled: (id) => this.db.enabled.has(id),
      rebuild: (state, record) => this.restart(state, record),
    });
    return this.report;
  }

  begin(automation: { id: string; hash: string }): string {
    const body = this.db.bodies.get(automation.id);
    if (body === undefined) throw new Error('unknown automation');
    const record = this.db.records.create({
      automationId: automation.id,
      revision: 1,
      ownerProfileId: null,
      status: 'running',
      mode: 'live',
      planHash: automation.hash,
    });
    const now = this.db.clock.now().getTime();
    const state: RunState = {
      runId: record.id,
      automationId: automation.id,
      revision: 1,
      planRefs: [{ id: automation.id, revision: 1, hash: automation.hash }],
      trigger: null,
      payload: {},
      inputs: {},
      ownerProfileId: null,
      origin: null,
      causeChain: [],
      frames: [rootFrame()],
      captures: {},
      budgets: startBudgets(resolveBudgets(), now),
      seed: 1,
    };
    this.driver.run({
      state,
      context: contextOf(body, this.home),
      name: 'Durable test',
      kind: 'live',
      startedBy: null,
    });
    return record.id;
  }

  private restart(state: RunState, _record: AutomationRunRecord): RunStart {
    const body = this.db.bodies.get(state.automationId);
    if (body === undefined) throw new Error('unknown automation');
    return {
      state,
      context: contextOf(body, this.home),
      name: 'Durable test',
      kind: 'live',
      startedBy: null,
    };
  }

  private ports(): DriverPorts {
    return {
      clock: this.db.clock,
      monotonic: () => 0,
      ids: randomUUID,
      storm: (): void => undefined,
      perform: (request): Promise<NodeResult> => {
        this.requests.push(request.path);
        this.home.effects.push(request.node.key);
        return Promise.resolve({ ok: true, value: {} });
      },
      watch: (wait, resume) => {
        const entry = { wait, resume, cancelled: false };
        this.home.watched.push(entry);
        return () => {
          entry.cancelled = true;
        };
      },
      afterCancel: (): void => undefined,
      refused: (): void => undefined,
      recordRun: (): void => undefined,
      sink: {
        queued: (): void => undefined,
        dropped: (): void => undefined,
        started: (): void => undefined,
        slice: (): void => undefined,
        parked: (state): void => {
          this.parks.parked(state);
        },
        resumed: (state): void => {
          this.parks.resumed(state);
        },
        finished: (state, ending): void => {
          this.parks.ended(state.runId);
          this.db.records.update(state.runId, {
            status: ending.status,
            error: ending.error?.message ?? null,
            finished_at: this.db.clock.now().toISOString(),
            state: null,
            wake_at: null,
            waiting_on: null,
          });
          this.finished.push({ runId: state.runId, status: ending.status });
        },
      },
    };
  }
}

export function row(db: Database, id: string): AutomationRunRecord {
  return db.records.byId(id);
}
