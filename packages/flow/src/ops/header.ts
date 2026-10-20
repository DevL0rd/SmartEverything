import type { Program } from '../program/walk';
import type { Outcome } from './result';
import { outcome, refuse } from './result';
import type { HeaderOp } from './schema';
import { compact } from './util';

interface Swap {
  readonly changes: Readonly<Record<string, unknown>>;
  readonly back: Partial<HeaderOp>;
}

function lists(next: Program, op: HeaderOp): Swap {
  return {
    changes: compact({ variables: op.variables, inputs: op.inputs, outputs: op.outputs }),
    back: compact({
      variables: op.variables && next.variables,
      inputs: op.inputs && next.inputs,
      outputs: op.outputs && next.outputs,
    }),
  };
}

function description(next: Program, op: HeaderOp): Swap {
  if (op.description === undefined) return { changes: {}, back: {} };
  return {
    changes: { description: op.description ?? undefined },
    back: { description: next.description ?? null },
  };
}

function run(next: Program, op: HeaderOp): Swap {
  if (op.policy === undefined && op.admit === undefined) return { changes: {}, back: {} };
  if (next.kind !== 'automation') {
    return refuse('not_allowed', 'only an automation has a run policy and an admit rule');
  }
  return {
    changes: {
      ...(op.policy === undefined ? {} : { policy: op.policy }),
      ...(op.admit === undefined ? {} : { admit: op.admit ?? undefined }),
    },
    back: compact({
      policy: op.policy && next.policy,
      admit: op.admit === undefined ? undefined : (next.admit ?? null),
    }),
  };
}

function budgets(next: Program, op: HeaderOp): Swap {
  if (op.budgets === undefined) return { changes: {}, back: {} };
  if (next.kind !== 'automation') {
    return refuse('not_allowed', 'only an automation has runtime budgets');
  }
  return {
    changes: { budgets: op.budgets ?? undefined },
    back: { budgets: next.budgets ?? null },
  };
}

export function applyHeader(program: Program, op: HeaderOp): Outcome {
  const next = structuredClone(program);
  const swaps = [lists(next, op), description(next, op), run(next, op), budgets(next, op)];
  for (const swap of swaps) Object.assign(next, swap.changes);
  const back: HeaderOp = { op: 'header' };
  for (const swap of swaps) Object.assign(back, swap.back);
  return outcome(compact(next), [back]);
}
