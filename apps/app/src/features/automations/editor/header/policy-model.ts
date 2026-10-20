import type { AutomationV3, RunMode, RunPolicy } from '@smarteverything/domain';
import type { HeaderOp } from '@smarteverything/flow/ops/schema';

export const DEFAULT_MAX = 10;

export interface ModeChoice {
  readonly value: RunMode;
  readonly label: string;
  readonly explain: string;
}

export const MODE_CHOICES: readonly ModeChoice[] = [
  {
    value: 'single',
    label: 'One at a time',
    explain: 'A start while a run is going is ignored.',
  },
  {
    value: 'restart',
    label: 'Restart',
    explain: 'A new start stops the running one and begins again.',
  },
  {
    value: 'queue',
    label: 'Queue',
    explain: 'A new start waits for the running one to finish, then runs in order.',
  },
  {
    value: 'parallel',
    label: 'Parallel',
    explain: 'Every start runs at once, side by side.',
  },
];

export const BUTTON_HINT = 'Presses during a run are ignored. Use Queue.';

export function explainMode(mode: RunMode): string {
  return MODE_CHOICES.find((choice) => choice.value === mode)?.explain ?? '';
}

export function allowsMax(mode: RunMode): boolean {
  return mode === 'queue' || mode === 'parallel';
}

export function withMode(policy: RunPolicy, mode: RunMode): RunPolicy {
  const { max, maxWait, ...rest } = policy;
  if (!allowsMax(mode)) return { ...rest, mode };
  return {
    ...rest,
    mode,
    max: max ?? DEFAULT_MAX,
    ...(maxWait === undefined ? {} : { maxWait }),
  };
}

export function withMax(policy: RunPolicy, max: number | null): RunPolicy {
  const { max: _dropped, ...rest } = policy;
  return max === null ? rest : { ...rest, max };
}

export function withMaxWait(policy: RunPolicy, maxWait: number | null): RunPolicy {
  const { maxWait: _dropped, ...rest } = policy;
  return maxWait === null ? rest : { ...rest, maxWait };
}

export function withRunTimeout(policy: RunPolicy, timeout: number | null): RunPolicy {
  const { timeout: _dropped, ...rest } = policy;
  return timeout === null ? rest : { ...rest, timeout };
}

export function policyOp(policy: RunPolicy): HeaderOp {
  return { op: 'header', policy };
}

export function maxSummary(policy: RunPolicy): string {
  if (!allowsMax(policy.mode)) return '';
  return policy.max === undefined ? 'No limit' : `Up to ${String(policy.max)}`;
}

export function needsButtonHint(program: AutomationV3): boolean {
  if (program.policy.mode !== 'single') return false;
  return program.triggers.some(
    (trigger) => trigger.kind === 'trigger.button' && trigger.enabled !== false,
  );
}

export const RUN_TIMEOUT_DEFAULT_MS = 600_000;
export const MAX_WAIT_DEFAULT_MS = 60_000;
