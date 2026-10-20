import type { FirewallApplyOutcome, FirewallStepResult } from './api/firewall';
import type { FirewallStep } from './firewall-commands';

const ALREADY_PRESENT = /skipping adding existing rule|already[_ ]enabled|already exists/iu;
const REPORT_LINE = /^(\d+)\t(\d+)\t(.*)$/u;

interface StepReport {
  readonly exitCode: number;
  readonly output: string;
}

export function stepResultOf(
  step: FirewallStep,
  exitCode: number,
  output: string,
): FirewallStepResult {
  const detail = output.trim();
  const { label, command } = step;
  if (exitCode !== 0) {
    const reason = detail === '' ? `it exited with code ${String(exitCode)}` : detail;
    return { label, command, outcome: 'failed', detail: reason };
  }
  return {
    label,
    command,
    outcome: ALREADY_PRESENT.test(detail) ? 'already_present' : 'applied',
    detail,
  };
}

export function reportScript(steps: readonly FirewallStep[]): string {
  return steps
    .map(
      (step, index) =>
        `out=$(${step.command} 2>&1); code=$?; printf '%s\\t%s\\t%s\\n' ${String(index)} "$code" "$(printf '%s' "$out" | tr '\\n\\t' '  ')"`,
    )
    .join('\n');
}

function reportsIn(stdout: string): ReadonlyMap<number, StepReport> {
  const reports = new Map<number, StepReport>();
  for (const line of stdout.split(/\r\n|\r|\n/u)) {
    const match = REPORT_LINE.exec(line);
    if (match !== null) {
      reports.set(Number(match[1]), { exitCode: Number(match[2]), output: match[3] ?? '' });
    }
  }
  return reports;
}

export function stepResultsOf(
  steps: readonly FirewallStep[],
  stdout: string,
): FirewallStepResult[] {
  const reports = reportsIn(stdout);
  return steps.map((step, index) => {
    const report = reports.get(index);
    return report === undefined
      ? stepResultOf(step, 1, 'The script stopped before this command ran.')
      : stepResultOf(step, report.exitCode, report.output);
  });
}

export function allFailed(steps: readonly FirewallStep[], reason: string): FirewallStepResult[] {
  return steps.map((step) => stepResultOf(step, 1, reason));
}

export function appliedOutcomeOf(
  steps: readonly FirewallStepResult[],
): Extract<FirewallApplyOutcome, 'applied' | 'partial' | 'failed'> {
  const failed = steps.filter((step) => step.outcome === 'failed').length;
  if (failed === 0) {
    return 'applied';
  }
  return failed === steps.length ? 'failed' : 'partial';
}

function countText(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}

export function appliedDetailOf(steps: readonly FirewallStepResult[]): string {
  const failed = steps.filter((step) => step.outcome === 'failed').length;
  const present = steps.filter((step) => step.outcome === 'already_present').length;
  const added = steps.length - failed - present;
  const parts = [
    ...(added > 0 ? [`${countText(added, 'change')} made`] : []),
    ...(present > 0 ? [`${countText(present, 'change')} already in place`] : []),
    ...(failed > 0 ? [`${countText(failed, 'change')} failed`] : []),
  ];
  return parts.length === 0 ? 'There was nothing to change.' : `${parts.join(', ')}.`;
}
