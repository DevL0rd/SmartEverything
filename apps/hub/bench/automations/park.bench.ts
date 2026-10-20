import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { rootFrame } from '@smarteverything/flow/interpret/frames';
import type { RunState } from '@smarteverything/flow/state/run-state';
import { bench, describe } from 'vitest';
import { parkingOf, RunParkStore } from '../../src/automations/driver/park-store';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { AUTOMATIONS_V3_STATEMENTS } from '../../src/store/migrations/automations-v3-schema';
import { AutomationRunRecordsRepository } from '../../src/store/repositories/automation-run-records';
import { Sql } from '../../src/store/sql';
import { SimulatedClock } from '../../src/clock/simulated';
import { START, stateAt } from '../../test/automations-v3/driver/support';
import {
  Home,
  Hub,
  addAutomation,
  database,
  effect,
  level,
  polling,
  seq,
  sleep,
} from '../../test/automations-v3/durability/support';
import { testLogger } from '../../test/support/logs';
import { percentile, record, tick, checked } from './support';

const KIB = 1024;

interface FileStore {
  readonly records: AutomationRunRecordsRepository;
  readonly automation: (id: string) => void;
}

function fileRecords(directory: string, clock: SimulatedClock): FileStore {
  const raw = new DatabaseSync(join(directory, 'park.db'), { enableForeignKeyConstraints: true });
  raw.exec('pragma journal_mode = wal');
  raw.exec('pragma synchronous = normal');
  const sql = new Sql(raw);
  migrate(sql, MIGRATIONS, START, testLogger());
  raw.exec('begin');
  for (const statement of AUTOMATIONS_V3_STATEMENTS) raw.exec(statement);
  raw.exec('commit');
  const context = new StoreContext(sql, new ChangeFeed(testLogger('store')), () => clock.now());
  return {
    records: new AutomationRunRecordsRepository(context, () => undefined),
    automation: (id): void => {
      sql.run(
        'add a bench automation',
        'insert into automations (id, name, enabled, definition, run_count, created_at, updated_at) values ($id, $id, 1, $definition, 0, $now, $now)',
        { id, definition: '{"when":[],"steps":[]}', now: START },
      );
    },
  };
}

function stateOfSize(bytes: number, automationId: string, runId: string): RunState {
  const captures: Record<string, { ok: true; value: { text: string } }> = {};
  const entry = 160;
  for (let index = 0; index * entry < bytes; index += 1) {
    captures[`node${String(index)}`] = { ok: true, value: { text: 'x'.repeat(entry - 40) } };
  }
  const now = Date.parse(START);
  return {
    ...stateAt(now),
    runId,
    automationId,
    captures,
    frames: [rootFrame()],
    wait: {
      kind: 'duration',
      nodePath: 'root/0',
      durable: true,
      dueAt: now + 3_600_000,
    },
  };
}

function time(work: () => void, rounds: number): number[] {
  const samples: number[] = [];
  for (let round = 0; round < rounds; round += 1) {
    const started = performance.now();
    work();
    samples.push((performance.now() - started) * 1000);
  }
  return samples;
}

function measurePark(): void {
  const directory = mkdtempSync(join(tmpdir(), 'bench-park-'));
  const clock = new SimulatedClock(START);
  const { records, automation } = fileRecords(directory, clock);
  const store = new RunParkStore(records, clock);
  for (const kib of [1, 16, 64]) {
    const state = stateOfSize(kib * KIB, randomUUID(), randomUUID());
    automation(state.automationId);
    records.create({
      id: state.runId,
      automationId: state.automationId,
      revision: 1,
      ownerProfileId: null,
      status: 'running',
      mode: 'live',
      planHash: 'a'.repeat(64),
    });
    const bytes = JSON.stringify(state).length;
    time(() => store.parked(state), 20);
    const serialise = time(() => parkingOf(state, clock.now().getTime()), 200);
    const whole = time(() => store.parked(state), 200);
    const resume = time(() => {
      store.resumed(state);
      store.parked(state);
    }, 200);
    record('B5', `state bytes of the ${String(kib)} KiB case`, bytes, 'bytes');
    record(
      'B5',
      `serialise and validate, ${String(kib)} KiB, median`,
      percentile(serialise, 0.5),
      'us',
    );
    record('B5', `whole park write, ${String(kib)} KiB, median`, percentile(whole, 0.5), 'us');
    record('B5', `whole park write, ${String(kib)} KiB, p95`, percentile(whole, 0.95), 'us');
    record('B5', `resume plus park, ${String(kib)} KiB, median`, percentile(resume, 0.5), 'us');
  }
  rmSync(directory, { recursive: true, force: true });
}

async function pollingWrites(gapMs: number): Promise<{ parks: number; resumes: number }> {
  const db = database();
  const home = new Home();
  const hub = new Hub(db, home);
  let parks = 0;
  let resumes = 0;
  const park = db.records.park.bind(db.records);
  const resume = db.records.resume.bind(db.records);
  db.records.park = (...parameters: Parameters<typeof park>): ReturnType<typeof park> => {
    parks += 1;
    return park(...parameters);
  };
  db.records.resume = (...parameters: Parameters<typeof resume>): ReturnType<typeof resume> => {
    resumes += 1;
    return resume(...parameters);
  };
  hub.begin(addAutomation(db, polling('poll', gapMs, 3_600_000, seq(effect('tick')))));
  await hub.settle();
  for (let elapsed = 0; elapsed < 3_600_000; elapsed += gapMs) await hub.advance(gapMs);
  return { parks, resumes };
}

async function parkedRuns(kind: 'level' | 'sleep', runs: number): Promise<void> {
  const db = database();
  const home = new Home();
  const hub = new Hub(db, home);
  const body =
    kind === 'level' ? seq(level('wait'), effect('after')) : seq(sleep('nap', 3_600_000));
  const automation = addAutomation(db, body);
  const idleBefore = process.cpuUsage();
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 3000);
  });
  const idle = process.cpuUsage(idleBefore);
  global.gc?.();
  const before = process.memoryUsage().heapUsed;
  for (let run = 0; run < runs; run += 1) hub.begin(automation);
  const parked = (): number => (kind === 'level' ? home.watched.length : db.clock.pending().length);
  for (let round = 0; round < 400 && parked() < runs; round += 1) await hub.settle();
  await tick();
  global.gc?.();
  const grown = process.memoryUsage().heapUsed - before;
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 3000);
  });
  const cpuBefore = process.cpuUsage();
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 3000);
  });
  const cpu = process.cpuUsage(cpuBefore);
  const active = hub.driver.active;
  record('B6', `${kind}: parked runs held by the driver`, active, 'count');
  record('B6', `${kind}: watch registrations`, home.watched.length, 'count');
  record(
    'B6',
    `${kind}: cancelled watches`,
    home.watched.filter((w) => w.cancelled).length,
    'count',
  );
  record('B6', `${kind}: pending clock timers`, db.clock.pending().length, 'count');
  record('B6', `${kind}: heap growth for the runs`, grown / (1024 * 1024), 'MiB');
  record('B6', `${kind}: cpu in 3 s with no runs`, (idle.user + idle.system) / 1000, 'ms');
  record('B6', `${kind}: cpu in 3 s at rest`, (cpu.user + cpu.system) / 1000, 'ms');
  record('B6', `${kind}: gc exposed`, global.gc === undefined ? 0 : 1, 'bool');
}

async function bootOf(runs: number): Promise<void> {
  const db = database();
  const home = new Home();
  const first = new Hub(db, home);
  const body = seq(sleep('nap', 3_600_000), effect('after'));
  const automation = addAutomation(db, body);
  const levelled = addAutomation(db, seq(level('wait'), effect('after')));
  for (let run = 0; run < runs; run += 1) first.begin(run % 2 === 0 ? automation : levelled);
  for (let round = 0; round < 400 && db.records.waiting().length < runs; round += 1) {
    await first.settle();
  }
  const samples: number[] = [];
  for (let rep = 0; rep < 7; rep += 1) {
    const hub = new Hub(db, home);
    const started = performance.now();
    const report = hub.boot();
    samples.push(performance.now() - started);
    if (report.resumed !== runs) throw new Error(`resumed ${String(report.resumed)}`);
  }
  record(
    'B11',
    `boot resume of ${String(runs)} waiting runs, median`,
    percentile(samples, 0.5),
    'ms',
  );
  record('B11', `boot resume of ${String(runs)} waiting runs, max`, Math.max(...samples), 'ms');
}

describe('B5 B6 B11 durable parking', () => {
  bench(
    'B5 park write cost by state size',
    () =>
      checked(() => {
        measurePark();
      }),
    { iterations: 1, warmupIterations: 0, time: 0 },
  );
  bench(
    'B5 flag: durable polling loop writes for one hour',
    () =>
      checked(async () => {
        for (const gap of [10_000, 60_000]) {
          const writes = await pollingWrites(gap);
          record(
            'B5',
            `park writes in one hour, ${String(gap / 1000)} s gap`,
            writes.parks,
            'count',
          );
          record(
            'B5',
            `resume writes in one hour, ${String(gap / 1000)} s gap`,
            writes.resumes,
            'count',
          );
        }
      }),
    { iterations: 1, warmupIterations: 0, time: 0 },
  );
  bench(
    'B6 one thousand parked runs',
    () =>
      checked(async () => {
        await parkedRuns('level', 1000);
        await parkedRuns('sleep', 1000);
      }),
    { iterations: 1, warmupIterations: 0, time: 0 },
  );
  bench(
    'B11 boot resume of 100 waiting runs',
    () =>
      checked(async () => {
        await bootOf(100);
      }),
    { iterations: 1, warmupIterations: 0, time: 0 },
  );
});
