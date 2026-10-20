import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plan, PlanOp } from '@smarteverything/flow/compile/plan';
import { CORE_FRAMES, CORE_OPS } from '@smarteverything/flow/interpret/core-ops';
import type { Evaluated, NodeResult, StepContext } from '@smarteverything/flow/interpret/frames';
import { LOOP_FRAMES, LOOP_OPS } from '@smarteverything/flow/interpret/loops';
import { TRY_FRAMES, TRY_OPS } from '@smarteverything/flow/interpret/try';
import { waitOps } from '@smarteverything/flow/interpret/waits';
import { resolveBudgets } from '@smarteverything/flow/state/budgets';
import type { StepRecord } from '@smarteverything/flow/interpret/frames';
import type { RunState } from '@smarteverything/flow/state/run-state';
import { RunDriver } from '../../src/automations/driver/admission';
import type { DriverPorts, Ending, RunKind } from '../../src/automations/driver/ports';
import { SimulatedClock } from '../../src/clock/simulated';
import { START, stateAt } from '../../test/automations-v3/driver/support';

const OUT = fileURLToPath(
  new URL('../../../../tmp/automations-v2/bench/results.jsonl', import.meta.url),
);

export function record(budget: string, metric: string, value: number, unit: string): void {
  mkdirSync(fileURLToPath(new URL('.', `file://${OUT}`)), { recursive: true });
  appendFileSync(OUT, `${JSON.stringify({ budget, metric, value: round(value), unit })}\n`);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
  return sorted[index] ?? 0;
}

export function tick(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

export function loopOf(times: number, body: PlanOp): PlanOp {
  return {
    op: 'loop',
    at: { id: randomUUID(), key: 'bench-loop' },
    source: { kind: 'count', times: { lit: times } },
    entryTest: false,
    order: 'test_then_gap',
    body,
  };
}

export function guardOp(key: string): PlanOp {
  return {
    op: 'guard',
    at: { id: randomUUID(), key },
    condition: { lit: true },
    quietly: true,
  };
}

export function effectOp(key: string): PlanOp {
  return {
    op: 'effect',
    at: { id: randomUUID(), key },
    kind: 'test.effect',
    params: {},
    retry: 'idempotent',
    budget: 'none',
  };
}

export function contextOf(body: PlanOp): StepContext {
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
    home: {},
    ops: {
      ...CORE_OPS,
      ...TRY_OPS,
      ...LOOP_OPS,
      ...waitOps({ nextOccurrence: () => ({ ok: true, value: 0 }) }),
    },
    frames: { ...CORE_FRAMES, ...TRY_FRAMES, ...LOOP_FRAMES },
  };
}

export interface Finished {
  readonly state: RunState;
  readonly ending: Ending;
}

export interface RealDriver {
  readonly driver: RunDriver;
  readonly slices: { count: number; records: number; bytes: number; yields: number };
  readonly finished: Promise<Finished>;
  readonly begin: (body: PlanOp) => void;
}

type Slices = RealDriver['slices'];

function sinkOf(
  onSlice: (records: readonly StepRecord[]) => void,
  done: (finished: Finished) => void,
): DriverPorts['sink'] {
  return {
    queued: (): void => undefined,
    dropped: (): void => undefined,
    started: (): void => undefined,
    slice: (_runId, records: readonly StepRecord[]): void => {
      onSlice(records);
    },
    parked: (): void => undefined,
    resumed: (): void => undefined,
    finished: (state, ending, _kind: RunKind): void => {
      done({ state, ending });
    },
  };
}

export function realDriver(measureBytes = false): RealDriver {
  const slices: Slices = { count: 0, records: 0, bytes: 0, yields: 0 };
  let done: (finished: Finished) => void = () => undefined;
  const finished = new Promise<Finished>((resolve) => {
    done = resolve;
  });
  const ports: DriverPorts = {
    clock: new SimulatedClock(START),
    monotonic: () => performance.now(),
    ids: randomUUID,
    storm: (): void => undefined,
    perform: (): Promise<NodeResult> => Promise.resolve({ ok: true, value: {} }),
    watch: () => () => undefined,
    afterCancel: (): void => undefined,
    refused: (): void => undefined,
    recordRun: (): void => undefined,
    sink: sinkOf(
      (records) => {
        slices.count += 1;
        slices.records += records.length;
        if (measureBytes) slices.bytes += JSON.stringify(records).length;
      },
      (result) => {
        done(result);
      },
    ),
  };
  const driver = new RunDriver({
    ports,
    decisions: { record: (): void => undefined },
    yieldNow: (resume): void => {
      slices.yields += 1;
      setImmediate(resume);
    },
  });
  return {
    driver,
    slices,
    finished,
    begin: (body): void => {
      driver.run({
        state: stateAt(Date.parse(START)),
        context: contextOf(body),
        name: 'Bench',
        kind: 'live',
        startedBy: null,
      });
    },
  };
}

export async function checked(work: () => Promise<void> | void): Promise<void> {
  try {
    await work();
  } catch (error) {
    process.stderr.write(
      `bench failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    throw error;
  }
}
