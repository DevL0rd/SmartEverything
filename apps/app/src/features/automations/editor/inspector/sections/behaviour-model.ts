import type { FlowNode, NodeKind, NodePolicy } from '@smarteverything/domain';
import type { RowEdit } from './rows-model';

export type FailureMode = 'fail' | 'continue' | 'route';

export type RetrySetting = NonNullable<NodePolicy['retry']>;

export const FAILURE_MODES: readonly { readonly value: FailureMode; readonly label: string }[] = [
  { value: 'fail', label: 'Stop the run' },
  { value: 'continue', label: 'Continue' },
  { value: 'route', label: 'Go to On error' },
];

export const DEFAULT_RETRY: RetrySetting = {
  attempts: 3,
  backoff: 'exponential',
  initial: 1000,
  max: 30_000,
  jitter: true,
};

const BEHAVING_CLASSES: ReadonlySet<NodeKind['class']> = new Set(['effect', 'read', 'control']);

export interface BehaviourView {
  readonly onError: FailureMode;
  readonly retry: RetrySetting | undefined;
  readonly retryOffered: boolean;
  readonly needsAcknowledgement: boolean;
  readonly acknowledged: boolean;
  readonly retryEnabled: boolean;
  readonly timeout: number | undefined;
}

export function hasBehaviour(kind: NodeKind | undefined): boolean {
  return kind !== undefined && BEHAVING_CLASSES.has(kind.class);
}

export function behaviourView(kind: NodeKind, policy: NodePolicy | undefined): BehaviourView {
  const retryClass = kind.effect?.retry;
  const needsAcknowledgement = retryClass !== undefined && retryClass !== 'idempotent';
  const acknowledged = policy?.acknowledgeRepeat === true;
  return {
    onError: policy?.onError ?? 'fail',
    retry: policy?.retry,
    retryOffered: retryClass !== undefined,
    needsAcknowledgement,
    acknowledged,
    retryEnabled: retryClass !== undefined && (!needsAcknowledgement || acknowledged),
    timeout: policy?.timeout,
  };
}

export function compactPolicy(policy: NodePolicy): NodePolicy | null {
  return Object.keys(policy).length === 0 ? null : policy;
}

export function withFailureMode(
  policy: NodePolicy | undefined,
  mode: FailureMode,
): NodePolicy | null {
  const { onError: _previous, ...rest } = policy ?? {};
  return compactPolicy(mode === 'fail' ? rest : { ...rest, onError: mode });
}

export function withTimeout(
  policy: NodePolicy | undefined,
  timeout: number | null,
): NodePolicy | null {
  const { timeout: _previous, ...rest } = policy ?? {};
  return compactPolicy(timeout === null ? rest : { ...rest, timeout });
}

export function withRetry(
  policy: NodePolicy | undefined,
  retry: RetrySetting | null,
): NodePolicy | null {
  const { retry: _previous, ...rest } = policy ?? {};
  return compactPolicy(retry === null ? rest : { ...rest, retry });
}

export function withAcknowledgement(
  policy: NodePolicy | undefined,
  acknowledged: boolean,
): NodePolicy | null {
  const { acknowledgeRepeat: _previous, ...rest } = policy ?? {};
  if (acknowledged) return compactPolicy({ ...rest, acknowledgeRepeat: true });
  const { retry: _retry, ...withoutRetry } = rest;
  return compactPolicy(withoutRetry);
}

export function evenedRetry(retry: RetrySetting, change: Partial<RetrySetting>): RetrySetting {
  const next: RetrySetting = { ...retry, ...change };
  if (next.max !== undefined && next.max < next.initial) return { ...next, max: next.initial };
  return next;
}

export const ROUTE_SCOPE = 'onError';

export function routeScopeEdit(node: FlowNode, mode: FailureMode): RowEdit | null {
  const present = node.scopes !== undefined && ROUTE_SCOPE in node.scopes;
  if (mode === 'route' && !present) return { t: 'scope.add', name: ROUTE_SCOPE };
  if (mode !== 'route' && present) return { t: 'scope.remove', name: ROUTE_SCOPE };
  return null;
}

export function routeLocked(node: FlowNode): boolean {
  return (node.scopes?.[ROUTE_SCOPE]?.nodes.length ?? 0) > 0;
}

export const TIMEOUT_DEFAULT_MS = 30_000;

export const RETRY_MOST = 10;
