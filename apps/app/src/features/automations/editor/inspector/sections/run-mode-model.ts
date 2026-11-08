import type { ActionMode, NodeKind, NodePolicy } from '@smarteverything/domain';
import { ACTION_MODES, modesOf, runModeOf } from '@smarteverything/domain';
import { compactPolicy } from './behaviour-model';

export interface RunModeChoice {
  readonly value: ActionMode;
  readonly title: string;
  readonly subtitle: string;
}

const CHOICE_OF: Readonly<Record<ActionMode, RunModeChoice>> = {
  fire_and_forget: {
    value: 'fire_and_forget',
    title: 'Continue right away',
    subtitle: 'The next step starts as soon as the command is sent.',
  },
  wait_for_result: {
    value: 'wait_for_result',
    title: 'Wait for the result',
    subtitle: 'The next step starts when the device confirms or the result arrives.',
  },
};

export const RUN_MODE_CHOICES: readonly RunModeChoice[] = ACTION_MODES.map(
  (mode) => CHOICE_OF[mode],
);

const FIXED_REASON: Readonly<Record<ActionMode, string>> = {
  fire_and_forget: 'This step always continues right away. It has no result to wait for.',
  wait_for_result: 'This step always waits, because what comes after it uses its result.',
};

export interface RunModeView {
  readonly mode: ActionMode;
  readonly choices: readonly RunModeChoice[];
  readonly fixed: RunModeChoice | undefined;
  readonly reason: string | undefined;
  readonly showsTimeout: boolean;
  readonly timeout: number | undefined;
}

export function hasRunMode(kind: NodeKind | undefined): boolean {
  return kind?.class === 'effect';
}

export function runModeView(kind: NodeKind, policy: NodePolicy | undefined): RunModeView {
  const { allowed } = modesOf(kind);
  const mode = runModeOf(kind, policy?.mode);
  const single = allowed.length === 1;
  return {
    mode,
    choices: RUN_MODE_CHOICES.filter((choice) => allowed.includes(choice.value)),
    fixed: single ? CHOICE_OF[mode] : undefined,
    reason: single ? FIXED_REASON[mode] : undefined,
    showsTimeout: mode === 'wait_for_result',
    timeout: policy?.timeout,
  };
}

export function withRunMode(
  kind: NodeKind,
  policy: NodePolicy | undefined,
  mode: ActionMode,
): NodePolicy | null {
  const { mode: _previous, ...rest } = policy ?? {};
  const modes = modesOf(kind);
  const stored = modes.allowed.includes(mode) && mode !== modes.default;
  return compactPolicy(stored ? { ...rest, mode } : rest);
}

export function runModeOwnsTimeout(
  kind: NodeKind | undefined,
  policy: NodePolicy | undefined,
): boolean {
  return (
    kind !== undefined && hasRunMode(kind) && runModeOf(kind, policy?.mode) === 'wait_for_result'
  );
}
