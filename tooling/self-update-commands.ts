import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import type { Command } from './release-android.ts';
import { capturedText } from './release-process.ts';
import { LOCK_SLOTS, STEPS_REQUEST, type LockKind, type StepRequest } from './self-update-steps.ts';

export type { StepRequest } from './self-update-steps.ts';

export type Step = StepRequest['steps'][number];

export interface StepOutcome {
  readonly status: number;
  readonly output: string;
}

export function locked(root: string, kind: LockKind, command: Command): Command {
  return {
    title: command.title,
    program: join(root, 'tmp', 'lockrun.sh'),
    args: [kind, String(LOCK_SLOTS[kind]), command.program, ...command.args],
    cwd: command.cwd,
    environment: command.environment,
  };
}

export function runStep(
  node: string,
  stepFile: string,
  root: string,
  request: StepRequest,
): StepOutcome {
  const validated = STEPS_REQUEST.parse(request);
  const wrapped = {
    ...validated,
    steps: validated.steps.map((step) => ({
      ...step,
      ...(step.kind === null
        ? {}
        : {
            program: join(root, 'tmp', 'lockrun.sh'),
            args: [step.kind, String(LOCK_SLOTS[step.kind]), step.program, ...step.args],
          }),
    })),
  };
  const result = spawnSync(node, [stepFile, JSON.stringify(wrapped)], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    status: result.status ?? 1,
    output: capturedText(result.stdout) + capturedText(result.stderr),
  };
}

export function outputTail(outcome: StepOutcome, lines: number): string {
  return outcome.output.trim().split('\n').slice(-lines).join('\n');
}
