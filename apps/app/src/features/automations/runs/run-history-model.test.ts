import { describe, expect, it } from 'vitest';
import {
  AUTOMATION_RUN_ID,
  type AutomationDecision,
  type AutomationRunSummary,
  type RunRecordStatus,
} from '@smarteverything/domain';
import {
  chartSummary,
  decisionRows,
  filterCounts,
  filterRuns,
  newestFirst,
  nodeOutcomes,
  percentile,
  runDays,
  spreadOf,
  tookMs,
  type RunFilter,
} from './run-history-model';

const NOW = Date.parse('2026-10-19T12:00:00Z');
const ZONE = 'UTC';

let counter = 0;

function run(
  at: string,
  status: RunRecordStatus,
  options: { mode?: AutomationRunSummary['mode']; ms?: number; steps?: number } = {},
): AutomationRunSummary {
  counter += 1;
  const start = Date.parse(at);
  return {
    id: AUTOMATION_RUN_ID.parse(`90000000-0000-4000-8000-${String(counter).padStart(12, '0')}`),
    automation_id: 'auto-1',
    revision: 1,
    owner_profile_id: null,
    control_key: null,
    parent_run_id: null,
    status,
    mode: options.mode ?? 'live',
    plan_hash: 'hash',
    current_node: null,
    started_by: null,
    steps: options.steps ?? 3,
    commands: 0,
    iterations: 0,
    active_paths: [],
    wake_at: null,
    error: null,
    created_at: at,
    started_at: at,
    finished_at: options.ms === undefined ? null : new Date(start + options.ms).toISOString(),
  };
}

function decision(
  reason: AutomationDecision['reason'],
  lastAt: string,
  count: number,
): AutomationDecision {
  return {
    automation_id: 'auto-1',
    window_start: lastAt,
    reason,
    count,
    first_at: lastAt,
    last_at: lastAt,
    detail: null,
  };
}

const RUNS = [
  run('2026-10-19T10:00:00Z', 'succeeded', { ms: 1000 }),
  run('2026-10-19T09:00:00Z', 'failed', { ms: 3000 }),
  run('2026-10-19T08:00:00Z', 'ignored'),
  run('2026-10-18T22:00:00Z', 'succeeded', { ms: 2000 }),
  run('2026-10-18T21:00:00Z', 'waiting'),
  run('2026-10-18T20:00:00Z', 'succeeded', { mode: 'dry', ms: 500 }),
  run('2026-10-17T20:00:00Z', 'succeeded', { mode: 'simulated', ms: 500 }),
];

const pick = (...filters: RunFilter[]): ReadonlySet<RunFilter> => new Set(filters);

describe('filterRuns', () => {
  it('shows only live runs when no chip is on', () => {
    expect(filterRuns(RUNS, pick()).map((entry) => entry.mode)).not.toContain('dry');
    expect(filterRuns(RUNS, pick())).toHaveLength(5);
  });

  it('keeps failed runs only for the Failed chip', () => {
    expect(filterRuns(RUNS, pick('failed')).map((entry) => entry.status)).toEqual(['failed']);
  });

  it('joins status chips as alternatives', () => {
    expect(filterRuns(RUNS, pick('failed', 'ignored'))).toHaveLength(2);
  });

  it('adds dry runs and simulations through their own chips', () => {
    expect(filterRuns(RUNS, pick('dry'))).toHaveLength(6);
    expect(filterRuns(RUNS, pick('simulated'))).toHaveLength(6);
    expect(filterRuns(RUNS, pick('dry', 'simulated'))).toHaveLength(7);
  });

  it('combines a mode chip with a status chip', () => {
    expect(filterRuns(RUNS, pick('dry', 'failed'))).toHaveLength(1);
  });

  it('counts each chip', () => {
    expect(filterCounts(RUNS)).toEqual({
      failed: 1,
      ignored: 1,
      waiting: 1,
      dry: 1,
      simulated: 1,
    });
  });
});

describe('day groups', () => {
  it('groups newest first runs by local day with failure counts', () => {
    const days = runDays(newestFirst(RUNS), ZONE);
    expect(days.map((day) => [day.key, day.runs.length, day.failed])).toEqual([
      ['2026-10-19', 3, 1],
      ['2026-10-18', 3, 0],
      ['2026-10-17', 1, 0],
    ]);
  });

  it('puts a run on the day of the chosen zone', () => {
    const late = [run('2026-10-18T23:30:00Z', 'succeeded')];
    expect(runDays(late, 'Asia/Bangkok')[0]?.key).toBe('2026-10-19');
  });
});

describe('durations', () => {
  it('reads the nearest rank percentile', () => {
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(sorted, 0.5)).toBe(5);
    expect(percentile(sorted, 0.95)).toBe(10);
    expect(percentile([], 0.5)).toBeNull();
  });

  it('ignores runs that did not finish', () => {
    const unfinished = run('2026-10-18T21:00:00Z', 'waiting');
    expect(tookMs(unfinished)).toBeNull();
    expect(spreadOf([unfinished])).toEqual({ p50: null, p95: null });
  });
});

describe('chartSummary', () => {
  const live = RUNS.filter((entry) => entry.mode === 'live');
  const { days, totals } = chartSummary(live, NOW, ZONE, 3);

  it('has one entry per day, empty days included', () => {
    expect(days.map((day) => day.day)).toEqual(['2026-10-17', '2026-10-18', '2026-10-19']);
    expect(days.map((day) => day.total)).toEqual([0, 2, 3]);
  });

  it('computes the failure rate over finished runs', () => {
    expect(days[2]?.rate).toBeCloseTo(0.5);
    expect(days[0]?.rate).toBeNull();
    expect(totals.rate).toBeCloseTo(1 / 3);
    expect(totals.failed).toBe(1);
    expect(totals.total).toBe(5);
  });

  it('computes the duration spread per day and overall', () => {
    expect(days[2]).toMatchObject({ p50: 1000, p95: 3000 });
    expect(totals).toMatchObject({ p50: 2000, p95: 3000 });
  });

  it('leaves out runs older than the window', () => {
    const old = chartSummary(live, NOW, ZONE, 1);
    expect(old.totals.total).toBe(3);
  });
});

describe('nodeOutcomes', () => {
  it('marks the last step of a failed run as failed', () => {
    expect(nodeOutcomes(run('2026-10-19T10:00:00Z', 'failed', { steps: 4 }))).toEqual({
      ok: 3,
      failed: 1,
    });
    expect(nodeOutcomes(run('2026-10-19T10:00:00Z', 'succeeded', { steps: 4 }))).toEqual({
      ok: 4,
      failed: 0,
    });
  });
});

describe('decisionRows', () => {
  const rows = decisionRows(
    [
      decision('single_busy', '2026-10-19T11:30:00Z', 2),
      decision('single_busy', '2026-10-19T03:00:00Z', 5),
      decision('storm', '2026-10-15T03:00:00Z', 9),
      decision('feedback', '2026-10-01T03:00:00Z', 4),
    ],
    NOW,
  );

  it('counts each reason per window and drops reasons older than a week', () => {
    expect(rows.map((row) => row.reason)).toEqual(['storm', 'single_busy']);
    expect(rows[1]?.counts).toEqual({ hour: 2, day: 7, week: 7 });
    expect(rows[0]?.counts).toEqual({ hour: 0, day: 0, week: 9 });
  });
});
