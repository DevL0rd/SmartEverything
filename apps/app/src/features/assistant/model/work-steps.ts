import type { ChatStepOutcome } from '@smarteverything/domain';
import { plural } from '../../../format/text';

export type StepState = 'running' | ChatStepOutcome;

export interface WorkStep {
  readonly key: string;
  readonly title: string;
  readonly state: StepState;
  readonly detail: string | null;
}

type WorkTone = 'live' | 'done' | 'failed';

export interface WorkSummary {
  readonly tone: WorkTone;
  readonly title: string;
  readonly note: string;
}

export function stepsOfRow(
  titles: readonly string[],
  states: readonly ChatStepOutcome[],
): readonly WorkStep[] {
  return titles.map((title, index) => ({
    key: `${String(index)}-${title}`,
    title,
    state: states[index] ?? 'done',
    detail: null,
  }));
}

function liveSummary(steps: readonly WorkStep[], thinking: boolean): WorkSummary {
  const running = steps.findLast((step) => step.state === 'running');
  return {
    tone: 'live',
    title: running?.title ?? (thinking ? 'Thinking' : 'Working'),
    note: steps.length === 0 ? '' : `Step ${String(steps.length)}`,
  };
}

function failedSummary(steps: readonly WorkStep[]): WorkSummary {
  const failures = steps.filter((step) => step.state === 'failed');
  const first = failures[0];
  const detail =
    first === undefined
      ? ''
      : [first.title, first.detail].filter((part) => part !== null && part !== '').join(': ');
  return {
    tone: 'failed',
    title: `${String(failures.length)} of ${plural(steps.length, 'step')} failed`,
    note: detail,
  };
}

function doneSummary(steps: readonly WorkStep[]): WorkSummary {
  const last = steps.at(-1);
  return {
    tone: 'done',
    title: last === undefined ? 'Worked' : last.title,
    note: plural(steps.length, 'step'),
  };
}

export function summaryOfSteps(
  steps: readonly WorkStep[],
  live: boolean,
  thinking: boolean,
): WorkSummary {
  if (live) {
    return liveSummary(steps, thinking);
  }
  return steps.some((step) => step.state === 'failed') ? failedSummary(steps) : doneSummary(steps);
}
