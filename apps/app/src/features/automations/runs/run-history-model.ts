import {
  ACTIVE_RUN_RECORD_STATUSES,
  type AutomationDecision,
  type AutomationRunSummary,
  type DECISION_REASONS,
  type RunRecordStatus,
} from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
import type { Tone } from '../../../components/tone';
import { DAY_MS, HOUR_MS, duration, localDayKey, shiftDay } from '../../../format/time';

type DecisionReason = (typeof DECISION_REASONS)[number];

export const RUN_LABELS: Readonly<Record<RunRecordStatus, string>> = {
  queued: 'Waiting its turn',
  running: 'Running',
  waiting: 'Waiting',
  paused: 'Paused',
  cancelling: 'Stopping',
  cancelled: 'Stopped',
  succeeded: 'Done',
  failed: 'Failed',
  interrupted: 'Interrupted',
  ignored: 'Skipped',
};

interface RunLook {
  readonly icon: IconName;
  readonly tone: Tone;
}

const RUN_LOOKS: Readonly<Record<RunRecordStatus, RunLook>> = {
  queued: { icon: 'timer', tone: 'variant' },
  running: { icon: 'activity', tone: 'primary' },
  waiting: { icon: 'clock', tone: 'info' },
  paused: { icon: 'pause', tone: 'warning' },
  cancelling: { icon: 'activity', tone: 'variant' },
  cancelled: { icon: 'ban', tone: 'variant' },
  succeeded: { icon: 'circleCheck', tone: 'positive' },
  failed: { icon: 'circleX', tone: 'critical' },
  interrupted: { icon: 'alert', tone: 'critical' },
  ignored: { icon: 'minus', tone: 'variant' },
};

export function runLook(status: RunRecordStatus): RunLook {
  return RUN_LOOKS[status];
}

export function isActive(status: RunRecordStatus): boolean {
  return ACTIVE_RUN_RECORD_STATUSES.has(status);
}

export function isFailure(status: RunRecordStatus): boolean {
  return status === 'failed' || status === 'interrupted';
}

const FINISHED_FOR_RATE: ReadonlySet<RunRecordStatus> = new Set([
  'succeeded',
  'failed',
  'interrupted',
]);

export const RUN_FILTERS = ['failed', 'ignored', 'waiting', 'dry', 'simulated'] as const;

export type RunFilter = (typeof RUN_FILTERS)[number];

export const FILTER_LABELS: Readonly<Record<RunFilter, string>> = {
  failed: 'Failed',
  ignored: 'Ignored',
  waiting: 'Waiting',
  dry: 'Dry runs',
  simulated: 'Simulations',
};

const STATUS_FILTERS: Readonly<Partial<Record<RunFilter, (status: RunRecordStatus) => boolean>>> = {
  failed: isFailure,
  ignored: (status) => status === 'ignored',
  waiting: (status) => status === 'waiting' || status === 'paused' || status === 'queued',
};

export function filterRuns(
  runs: readonly AutomationRunSummary[],
  chosen: ReadonlySet<RunFilter>,
): AutomationRunSummary[] {
  const statuses = RUN_FILTERS.flatMap((filter) => {
    const test = STATUS_FILTERS[filter];
    return chosen.has(filter) && test !== undefined ? [test] : [];
  });
  return runs.filter((run) => {
    const modeShown =
      run.mode === 'live' ||
      (run.mode === 'dry' && chosen.has('dry')) ||
      (run.mode === 'simulated' && chosen.has('simulated'));
    return modeShown && (statuses.length === 0 || statuses.some((test) => test(run.status)));
  });
}

function countOf(runs: readonly AutomationRunSummary[], filter: RunFilter): number {
  const test = STATUS_FILTERS[filter];
  return runs.filter((run) =>
    test === undefined ? run.mode === filter : run.mode === 'live' && test(run.status),
  ).length;
}

export function filterCounts(
  runs: readonly AutomationRunSummary[],
): Readonly<Record<RunFilter, number>> {
  return {
    failed: countOf(runs, 'failed'),
    ignored: countOf(runs, 'ignored'),
    waiting: countOf(runs, 'waiting'),
    dry: countOf(runs, 'dry'),
    simulated: countOf(runs, 'simulated'),
  };
}

export function newestFirst(runs: readonly AutomationRunSummary[]): AutomationRunSummary[] {
  return [...runs].sort((left, right) =>
    left.created_at < right.created_at ? 1 : left.created_at > right.created_at ? -1 : 0,
  );
}

export interface RunDay {
  readonly key: string;
  readonly first: AutomationRunSummary;
  readonly runs: AutomationRunSummary[];
  readonly failed: number;
}

export function runDays(runs: readonly AutomationRunSummary[], timeZone: string | null): RunDay[] {
  const days: { key: string; first: AutomationRunSummary; runs: AutomationRunSummary[] }[] = [];
  for (const run of runs) {
    const key = localDayKey(run.created_at, timeZone);
    const last = days.at(-1);
    if (last?.key === key) last.runs.push(run);
    else days.push({ key, first: run, runs: [run] });
  }
  return days.map((day) => ({
    ...day,
    failed: day.runs.filter((run) => isFailure(run.status)).length,
  }));
}

export function tookMs(run: AutomationRunSummary): number | null {
  if (run.started_at === null || run.finished_at === null) return null;
  return Math.max(0, Date.parse(run.finished_at) - Date.parse(run.started_at));
}

const MS_PER_SECOND = 1000;

export function durationLabel(ms: number): string {
  return ms < MS_PER_SECOND ? `${String(Math.round(ms))} ms` : duration(ms / MS_PER_SECOND);
}

export function triggerText(run: AutomationRunSummary): string {
  if (run.started_by === null) return 'Started by its trigger';
  if (run.started_by === 'manual') return 'Started by hand';
  return run.started_by;
}

export interface NodeOutcomes {
  readonly ok: number;
  readonly failed: number;
}

export function nodeOutcomes(run: AutomationRunSummary): NodeOutcomes {
  const failed = isFailure(run.status) && run.steps > 0 ? 1 : 0;
  return { ok: run.steps - failed, failed };
}

export function percentile(sorted: readonly number[], share: number): number | null {
  if (sorted.length === 0) return null;
  const rank = Math.ceil(share * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank))] ?? null;
}

export interface Spread {
  readonly p50: number | null;
  readonly p95: number | null;
}

export function spreadOf(runs: readonly AutomationRunSummary[]): Spread {
  const took = runs
    .map(tookMs)
    .filter((ms): ms is number => ms !== null)
    .sort((left, right) => left - right);
  return { p50: percentile(took, 0.5), p95: percentile(took, 0.95) };
}

export interface ChartDay extends Spread {
  readonly day: string;
  readonly total: number;
  readonly failed: number;
  readonly ok: number;
  readonly finished: number;
  readonly rate: number | null;
}

export interface ChartTotals extends Spread {
  readonly total: number;
  readonly failed: number;
  readonly rate: number | null;
}

export interface ChartSummary {
  readonly days: readonly ChartDay[];
  readonly totals: ChartTotals;
}

function dayOf(own: readonly AutomationRunSummary[], day: string): ChartDay {
  const failed = own.filter((run) => isFailure(run.status)).length;
  const finished = own.filter((run) => FINISHED_FOR_RATE.has(run.status)).length;
  return {
    day,
    total: own.length,
    failed,
    ok: own.length - failed,
    finished,
    rate: finished === 0 ? null : failed / finished,
    ...spreadOf(own),
  };
}

export function chartSummary(
  runs: readonly AutomationRunSummary[],
  now: number,
  timeZone: string | null,
  length: number,
): ChartSummary {
  const last = localDayKey(now, timeZone);
  const keys = Array.from({ length }, (_, index) => shiftDay(last, index - length + 1));
  const byDay = new Map<string, AutomationRunSummary[]>(keys.map((key) => [key, []]));
  for (const run of runs) byDay.get(localDayKey(run.created_at, timeZone))?.push(run);
  const days = keys.map((key) => dayOf(byDay.get(key) ?? [], key));
  const inWindow = [...byDay.values()].flat();
  const whole = dayOf(inWindow, '');
  return {
    days,
    totals: {
      total: whole.total,
      failed: whole.failed,
      rate: whole.rate,
      p50: whole.p50,
      p95: whole.p95,
    },
  };
}

export const DECISION_TEXT: Readonly<
  Record<DecisionReason, { readonly title: string; readonly why: string }>
> = {
  admit_false: {
    title: 'Only-if was false',
    why: 'The trigger fired but the conditions to run were not met.',
  },
  single_busy: {
    title: 'Already running',
    why: 'This automation runs one at a time and the earlier run was not finished.',
  },
  queue_full: {
    title: 'Queue was full',
    why: 'Too many runs were waiting their turn.',
  },
  parallel_full: {
    title: 'Too many at once',
    why: 'The limit of parallel runs was reached.',
  },
  stale: {
    title: 'Too late to run',
    why: 'The run waited so long that the moment had passed.',
  },
  storm: {
    title: 'Too many triggers',
    why: 'Triggers arrived faster than the allowed rate, so some were dropped.',
  },
  feedback: {
    title: 'Caused by itself',
    why: 'Its own changes triggered it again, so the loop was stopped.',
  },
};

export const DECISION_WINDOWS = [
  { id: 'hour', label: 'Last hour', ms: HOUR_MS },
  { id: 'day', label: 'Last 24 hours', ms: DAY_MS },
  { id: 'week', label: 'Last 7 days', ms: 7 * DAY_MS },
] as const;

export type DecisionWindowId = (typeof DECISION_WINDOWS)[number]['id'];

export interface DecisionRow {
  readonly reason: DecisionReason;
  readonly counts: Readonly<Record<DecisionWindowId, number>>;
  readonly lastAt: string;
}

export function decisionRows(decisions: readonly AutomationDecision[], now: number): DecisionRow[] {
  const byReason = new Map<
    DecisionReason,
    { counts: Record<DecisionWindowId, number>; lastAt: string }
  >();
  for (const decision of decisions) {
    const entry = byReason.get(decision.reason) ?? {
      counts: { hour: 0, day: 0, week: 0 },
      lastAt: decision.last_at,
    };
    for (const window of DECISION_WINDOWS) {
      if (Date.parse(decision.last_at) >= now - window.ms)
        entry.counts[window.id] += decision.count;
    }
    if (decision.last_at > entry.lastAt) entry.lastAt = decision.last_at;
    byReason.set(decision.reason, entry);
  }
  return [...byReason.entries()]
    .map(([reason, entry]) => ({ reason, counts: entry.counts, lastAt: entry.lastAt }))
    .filter((row) => row.counts.week > 0)
    .sort((left, right) => right.counts.week - left.counts.week);
}
