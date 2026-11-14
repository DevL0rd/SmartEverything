import { spawnSync } from 'node:child_process';
import { BuildMemoryLimitError, killedByLimit, type BuildScope } from './build-scope.ts';
import { capturedText } from './release-process.ts';
import { STEPS_REQUEST, type StepRequest } from './self-update-steps.ts';

export type { StepRequest } from './self-update-steps.ts';

export type Step = StepRequest['steps'][number];

export interface StepOutcome {
  readonly status: number;
  readonly output: string;
}

export interface StepLaunch {
  readonly node: string;
  readonly stepFile: string;
  readonly root: string;
}

export function runStep(
  launcher: StepLaunch,
  request: StepRequest,
  scope?: BuildScope,
): StepOutcome {
  const { node, stepFile, root } = launcher;
  const validated = STEPS_REQUEST.parse(request);
  const launch = scope?.command(node, [stepFile, JSON.stringify(validated)]) ?? {
    program: node,
    args: [stepFile, JSON.stringify(validated)],
  };
  const result = spawnSync(launch.program, [...launch.args], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error !== undefined) return { status: 1, output: result.error.message };
  if (scope !== undefined && killedByLimit(result.status, result.signal))
    return {
      status: result.status ?? 1,
      output: `${capturedText(result.stdout)}${capturedText(result.stderr)}${new BuildMemoryLimitError(scope.kind, scope.limitBytes).message}\n`,
    };
  return {
    status: result.status ?? 1,
    output: capturedText(result.stdout) + capturedText(result.stderr),
  };
}

export function outputTail(outcome: StepOutcome, lines: number): string {
  return outcome.output.trim().split('\n').slice(-lines).join('\n');
}
