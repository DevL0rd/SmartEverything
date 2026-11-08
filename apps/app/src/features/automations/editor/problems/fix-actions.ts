import type { NodeKindLookup } from '@smarteverything/domain';
import type { PortValue, ProgramV4 } from '@smarteverything/domain';
import type { LintAction } from '@smarteverything/flow/check/lint';
import type { PatchResult } from '@smarteverything/flow/graph/ops/reducer';
import type { PatchOp } from '@smarteverything/flow/graph/ops/schema';
import { replaceOps } from '../../model/editor/replace';
import type { LiveFinding } from './problem-model';

export type FixOps = readonly PatchOp[];

const STORM_SWITCHES = { startBucket: 'on', feedback: 'on', effects: 'on' } as const;

function stormOps(program: ProgramV4): FixOps | null {
  if (program.kind !== 'automation') return null;
  return [{ op: 'header', budgets: { ...program.budgets, ...STORM_SWITCHES } }];
}

function firstWrittenSource(program: ProgramV4, key: string): Record<string, PortValue> {
  const node = program.nodes.find((candidate) => candidate.key === key);
  const first = node?.branches?.[0]?.to;
  const written = program.nodes.find((candidate) => candidate.key === first)?.ports?.['source'];
  return written === undefined ? {} : { source: written };
}

function cycleOps(
  program: ProgramV4,
  key: string,
  variable: string,
  kinds: NodeKindLookup,
): FixOps | null {
  const ports = {
    ...firstWrittenSource(program, key),
    name: { lit: variable },
    op: { lit: 'next' },
  };
  return replaceOps(
    program,
    key,
    { kind: 'var.change', base: 'change', ports },
    { dropOwned: true, kinds },
  );
}

export function fixOps(
  program: ProgramV4,
  action: LintAction,
  kinds: NodeKindLookup,
): FixOps | null {
  switch (action.action) {
    case 'turn_on_storm_protection':
      return stormOps(program);
    case 'set_port':
      return [{ op: 'set', key: action.key, ports: { [action.port]: action.value } }];
    case 'wait_until': {
      const ports = { condition: action.condition };
      return replaceOps(
        program,
        action.key,
        { kind: 'flow.wait_condition', base: 'wait', ports },
        { dropOwned: true, kinds },
      );
    }
    case 'cycle_variable':
      return cycleOps(program, action.key, action.variable, kinds);
    case 'set_run_mode': {
      const node = program.nodes.find((candidate) => candidate.key === action.key);
      return [{ op: 'set', key: action.key, policy: { ...node?.policy, mode: action.mode } }];
    }
    case 'lookup_table':
      return null;
  }
}

export function fixOpsOf(
  program: ProgramV4,
  found: LiveFinding,
  kinds: NodeKindLookup,
): FixOps | null {
  return found.action === undefined ? null : fixOps(program, found.action, kinds);
}

export function applyFix(
  apply: (ops: readonly PatchOp[]) => PatchResult,
  program: ProgramV4,
  found: LiveFinding,
  kinds: NodeKindLookup,
): PatchResult | null {
  const ops = fixOpsOf(program, found, kinds);
  return ops === null ? null : apply(ops);
}
