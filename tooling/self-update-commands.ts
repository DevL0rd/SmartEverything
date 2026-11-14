import { spawnSync } from 'node:child_process';
import { capturedText } from './release-process.ts';
import { STEPS_REQUEST, type StepRequest } from './self-update-steps.ts';

export type { StepRequest } from './self-update-steps.ts';

export type Step = StepRequest['steps'][number];

export interface StepOutcome {
  readonly status: number;
  readonly output: string;
}

export function runStep(
  node: string,
  stepFile: string,
  root: string,
  request: StepRequest,
): StepOutcome {
  const validated = STEPS_REQUEST.parse(request);
  const result = spawnSync(node, [stepFile, JSON.stringify(validated)], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error !== undefined) return { status: 1, output: result.error.message };
  return {
    status: result.status ?? 1,
    output: capturedText(result.stdout) + capturedText(result.stderr),
  };
}

export function outputTail(outcome: StepOutcome, lines: number): string {
  return outcome.output.trim().split('\n').slice(-lines).join('\n');
}
