import type { PlanOp } from '@smarteverything/flow/compile/plan';
import { bench, describe } from 'vitest';
import { effectOp, guardOp, loopOf, percentile, realDriver, record, checked } from './support';

const ITERATIONS = 100_000;

interface Outcome {
  readonly gaps: number[];
  readonly wallMs: number;
  readonly steps: number;
  readonly status: string;
  readonly yields: number;
}

async function runLoop(body: PlanOp): Promise<Outcome> {
  const real = realDriver();
  const gaps: number[] = [];
  let last = performance.now();
  const probe = setInterval(() => {
    const now = performance.now();
    gaps.push(now - last);
    last = now;
  }, 1);
  const started = performance.now();
  real.begin(loopOf(ITERATIONS, body));
  const { state, ending } = await real.finished;
  const wallMs = performance.now() - started;
  clearInterval(probe);
  return {
    gaps,
    wallMs,
    steps: state.budgets.steps,
    status: ending.status === 'failed' ? (ending.error?.message ?? 'failed') : ending.status,
    yields: real.slices.yields,
  };
}

async function repeated(label: string, body: PlanOp): Promise<void> {
  const runs: Outcome[] = [];
  for (let repeat = 0; repeat < 5; repeat += 1) runs.push(await runLoop(body));
  const gaps = runs.flatMap((run) => run.gaps);
  const perStep = runs.map((run) => (run.wallMs * 1000) / Math.max(1, run.steps));
  const [first] = runs;
  record('B1', `${label}: run succeeded`, first?.status === 'succeeded' ? 1 : 0, 'bool');
  record('B1', `${label}: steps executed`, first?.steps ?? 0, 'count');
  record('B1', `${label}: scheduler yields`, first?.yields ?? 0, 'count');
  record('B1', `${label}: probe gap median`, percentile(gaps, 0.5), 'ms');
  record('B1', `${label}: probe gap p99`, percentile(gaps, 0.99), 'ms');
  record('B1', `${label}: probe gap max`, Math.max(...gaps), 'ms');
  record(
    'B1',
    `${label}: wall time of one run`,
    percentile(
      runs.map((run) => run.wallMs),
      0.5,
    ),
    'ms',
  );
  record('B3', `${label}: cost per step median`, percentile(perStep, 0.5), 'us');
}

describe('B1 and B3 loop of 100 000 iterations on the real scheduler', () => {
  bench(
    'B1 probe timer gap and B3 per step cost',
    () =>
      checked(async () => {
        await repeated('pure loop', guardOp('step'));
        await repeated('loop with an effect each turn', effectOp('turn'));
      }),
    { iterations: 1, warmupIterations: 0, time: 0 },
  );
});
