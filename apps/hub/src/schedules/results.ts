import {
  SCHEDULE_LIMITS,
  type ScheduleOutcome,
  type ScheduleResult,
  type ScheduleState,
} from '@smarteverything/domain';
import type { StepOutcome } from './steps';

export interface ResultInput {
  readonly occurrence: number;
  readonly step: number;
  readonly at: Date;
  readonly outcome: StepOutcome;
  readonly lateMs: number;
  readonly as?: ScheduleOutcome;
}

export function resultOf(input: ResultInput): ScheduleResult {
  const { outcome } = input;
  return {
    occurrence: input.occurrence,
    step: input.step,
    at: input.at.toISOString(),
    outcome: input.as ?? outcome.outcome,
    line: outcome.line.slice(0, 400),
    detail: outcome.detail === null ? null : outcome.detail.slice(0, 1000),
    late_ms: Math.round(input.lateMs),
  };
}

export function missedRun(occurrence: number, skipped: number, at: Date): ScheduleResult {
  return {
    occurrence,
    step: -1,
    at: at.toISOString(),
    outcome: 'missed',
    line: skipped === 1 ? 'Skipped 1 missed run' : `Skipped ${String(skipped)} missed runs`,
    detail: 'The server was off when they were due.',
    late_ms: 0,
  };
}

export function withResults(
  results: readonly ScheduleResult[],
  added: readonly ScheduleResult[],
): ScheduleResult[] {
  return [...results, ...added].slice(-SCHEDULE_LIMITS.results);
}

const PROBLEMS: ReadonlySet<ScheduleOutcome> = new Set(['failed', 'interrupted']);

export function finalStateOf(results: readonly ScheduleResult[]): ScheduleState {
  const latest = new Map<string, ScheduleOutcome>();
  for (const result of results) {
    latest.set(`${String(result.occurrence)}:${String(result.step)}`, result.outcome);
  }
  return [...latest.values()].some((outcome) => PROBLEMS.has(outcome)) ? 'failed' : 'done';
}
