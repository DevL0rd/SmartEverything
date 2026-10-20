import type { FlowNode } from '@smarteverything/domain';
import type { Finding, LintAction } from '@smarteverything/flow/check/lint';
import { findByKey, indexProgram } from '@smarteverything/flow/program/lookup';
import type { Program } from '@smarteverything/flow/program/walk';
import type { PatchResult } from '@smarteverything/flow/ops/reducer';
import type { PatchOp } from '@smarteverything/flow/ops/schema';
import { locationOf } from '@smarteverything/flow/ops/target';

export type FixOps = readonly PatchOp[];

const STORM_SWITCHES = { startBucket: 'on', feedback: 'on', effects: 'on' } as const;

function stormOps(program: Program): FixOps | null {
  if (program.kind !== 'automation') return null;
  return [{ op: 'header', budgets: { ...program.budgets, ...STORM_SWITCHES } }];
}

function replaceOps(
  program: Program,
  key: string,
  replacement: { readonly kind: string; readonly ports: FlowNode['ports'] },
): FixOps | null {
  const entry = findByKey(indexProgram(program), key);
  if (entry?.kind !== 'node') return null;
  const place = locationOf(entry);
  return [
    { op: 'add', node: replacement, in: place.target, index: place.index },
    { op: 'remove', key },
  ];
}

function firstWrittenSource(node: FlowNode): FlowNode['ports'] {
  const written = node.branches?.[0]?.scope.nodes[0]?.ports?.['source'];
  return written === undefined ? {} : { source: written };
}

function cycleOps(program: Program, key: string, variable: string): FixOps | null {
  const entry = findByKey(indexProgram(program), key);
  if (entry?.kind !== 'node') return null;
  return replaceOps(program, key, {
    kind: 'var.change',
    ports: { ...firstWrittenSource(entry.node), name: { lit: variable }, op: { lit: 'next' } },
  });
}

export function fixOps(program: Program, action: LintAction): FixOps | null {
  switch (action.action) {
    case 'turn_on_storm_protection':
      return stormOps(program);
    case 'set_port':
      return [{ op: 'set', key: action.key, ports: { [action.port]: action.value } }];
    case 'wait_until':
      return replaceOps(program, action.key, {
        kind: 'flow.wait_condition',
        ports: { condition: action.condition },
      });
    case 'cycle_variable':
      return cycleOps(program, action.key, action.variable);
    case 'lookup_table':
      return null;
  }
}

export function fixOpsOf(program: Program, found: Finding): FixOps | null {
  const action = found.fix?.action;
  return action === undefined ? null : fixOps(program, action);
}

export function applyFix(
  apply: (ops: readonly PatchOp[]) => PatchResult,
  program: Program,
  found: Finding,
): PatchResult | null {
  const ops = fixOpsOf(program, found);
  return ops === null ? null : apply(ops);
}
