import {
  ACTIVE_AUTOMATION_RUN_STATUSES,
  walkSteps,
  type AutomationRunRow,
  type AutomationRunStatus,
  type AutomationV2,
} from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
import type { Tone } from '../../../components/tone';
import { dayBoundsOf, localDayKey } from '../../../format/time';
import { describeStep } from './describe-steps';
import type { Names } from './describe-names';
import { findStep } from './steps';
import { sentenceStart } from './time-text';

export const RUN_LABELS: Readonly<Record<AutomationRunStatus, string>> = {
  queued: 'Waiting its turn',
  running: 'Running',
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

const RUN_LOOKS: Readonly<Record<AutomationRunStatus, RunLook>> = {
  queued: { icon: 'timer', tone: 'variant' },
  running: { icon: 'activity', tone: 'primary' },
  cancelling: { icon: 'activity', tone: 'variant' },
  cancelled: { icon: 'ban', tone: 'variant' },
  succeeded: { icon: 'circleCheck', tone: 'positive' },
  failed: { icon: 'circleX', tone: 'critical' },
  interrupted: { icon: 'alert', tone: 'critical' },
  ignored: { icon: 'minus', tone: 'variant' },
};

export function runLook(status: AutomationRunStatus): RunLook {
  return RUN_LOOKS[status];
}

export function isActive(status: AutomationRunStatus): boolean {
  return ACTIVE_AUTOMATION_RUN_STATUSES.has(status);
}

interface RunDay {
  readonly key: string;
  readonly first: AutomationRunRow;
  readonly runs: AutomationRunRow[];
}

export function newestFirst(runs: readonly AutomationRunRow[]): AutomationRunRow[] {
  return [...runs].sort((left, right) =>
    left.created_at < right.created_at ? 1 : left.created_at > right.created_at ? -1 : 0,
  );
}

export function newestRuns(runs: readonly AutomationRunRow[], count: number): AutomationRunRow[] {
  const newest: AutomationRunRow[] = [];
  for (const run of runs) {
    const last = newest.at(-1);
    if (newest.length >= count && last !== undefined && run.created_at <= last.created_at) {
      continue;
    }
    let at = newest.length;
    while (at > 0 && (newest[at - 1]?.created_at ?? '') < run.created_at) {
      at -= 1;
    }
    newest.splice(at, 0, run);
    if (newest.length > count) {
      newest.pop();
    }
  }
  return newest;
}

export function runDays(runs: readonly AutomationRunRow[], timeZone: string | null): RunDay[] {
  const days: RunDay[] = [];
  for (const run of runs) {
    const key = localDayKey(run.created_at, timeZone);
    const last = days.at(-1);
    if (last?.key === key) {
      last.runs.push(run);
    } else {
      days.push({ key, first: run, runs: [run] });
    }
  }
  return days;
}

export function countRunsOnDay(
  runs: readonly AutomationRunRow[],
  day: string,
  timeZone: string | null,
): number {
  const { start, end } = dayBoundsOf(day, timeZone);
  let count = 0;
  for (const run of runs) {
    const at = Date.parse(run.created_at);
    if (at >= start && at < end) {
      count += 1;
    }
  }
  return count;
}

export function stepTitle(names: Names, automation: AutomationV2 | null, nodeId: string): string {
  const step = automation === null ? undefined : findStep(automation.steps, nodeId);
  if (step !== undefined) return sentenceStart(describeStep(names, step));
  const cases = walkSteps(automation?.steps ?? []).flatMap((entry) =>
    entry.do === 'if' ? entry.branches.map((branch, index) => ({ branch, index })) : [],
  );
  const found = cases.find((entry) => entry.branch.id === nodeId);
  return found === undefined ? 'A step that was removed' : `Check case ${String(found.index + 1)}`;
}

export function tookMs(run: AutomationRunRow): number | null {
  if (run.started_at === null || run.finished_at === null) return null;
  return Math.max(0, Date.parse(run.finished_at) - Date.parse(run.started_at));
}
