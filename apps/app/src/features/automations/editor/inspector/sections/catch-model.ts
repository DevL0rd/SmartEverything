import type { CATCHABLE_ERROR_CLASS, FlowNode, PortValue } from '@smarteverything/domain';
import type { PatchOp } from '@smarteverything/flow/ops/schema';
import type { z } from 'zod';

type CatchableClass = z.infer<typeof CATCHABLE_ERROR_CLASS>;

export const CATCH_CLASSES: readonly { readonly value: CatchableClass; readonly label: string }[] =
  [
    { value: 'Refused', label: 'Refused' },
    { value: 'Unreachable', label: 'Unreachable' },
    { value: 'Timeout', label: 'Timed out' },
    { value: 'Unknown', label: 'Unknown outcome' },
    { value: 'TypeError', label: 'Wrong type' },
    { value: 'MathError', label: 'Math error' },
    { value: 'Invalid', label: 'Invalid' },
    { value: 'NotFound', label: 'Not found' },
    { value: 'Forbidden', label: 'Not allowed' },
    { value: 'LimitExceeded', label: 'Limit reached' },
    { value: 'Failed', label: 'Failed' },
  ];

export function toggledClass(
  current: readonly CatchableClass[],
  name: CatchableClass,
): readonly CatchableClass[] {
  return current.includes(name) ? current.filter((entry) => entry !== name) : [...current, name];
}

export type FailAgainMode = 'same' | 'new';

function errorWire(tryKey: string): PortValue {
  return { wire: { from: tryKey, port: 'error' } };
}

export function failAgainPorts(
  source: string,
  mode: FailAgainMode,
): { readonly message?: PortValue; readonly cause: PortValue } {
  return mode === 'same'
    ? { cause: errorWire(source) }
    : { message: { lit: '' }, cause: errorWire(source) };
}

export function failAgainOps(
  tryKey: string,
  rowId: string,
  mode: FailAgainMode,
): readonly PatchOp[] {
  return [
    {
      op: 'add',
      in: `${tryKey}.catch:${rowId}`,
      node: { kind: 'flow.fail', ports: { ...failAgainPorts(tryKey, mode) } },
    },
  ];
}

export interface FailAgainChoice {
  readonly source: string;
  readonly mode: FailAgainMode;
}

export function failAgainChoice(node: FlowNode): FailAgainChoice | null {
  const cause = node.kind === 'flow.fail' ? node.ports?.['cause'] : undefined;
  if (cause === undefined || !('wire' in cause) || cause.wire.port !== 'error') return null;
  return { source: cause.wire.from, mode: node.ports?.['message'] === undefined ? 'same' : 'new' };
}
