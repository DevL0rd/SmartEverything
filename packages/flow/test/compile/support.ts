import type { FlowNode, JsonValue, PortValue, Scope } from '@smarteverything/domain';
import { NODE_REGISTRY } from '@smarteverything/domain';
import { expect } from 'vitest';
import { automation, fn, node } from '../functions/support';
import type { LowerContext, LowerResult } from '../../src/compile/lower';
import { lower } from '../../src/compile/lower';
import type { LowerProblem } from '../../src/compile/lower-effects';
import type { Plan, PlanOp } from '../../src/compile/plan';
import { PLAN } from '../../src/compile/plan';

export const context: LowerContext = { kinds: (id) => NODE_REGISTRY.get(id) };

export const lit = (value: JsonValue): PortValue => ({ lit: value });

export const wired = (reference: string): PortValue => {
  const [from = '', port = ''] = reference.split('.');
  return { wire: { from, port } };
};

export function make(
  key: string,
  kind: string,
  ports: Record<string, PortValue> = {},
  extra: Partial<FlowNode> = {},
): FlowNode {
  return { ...node(key, kind, ports), ...extra };
}

export function scope(...nodes: FlowNode[]): Scope {
  return { nodes };
}

export function run(nodes: FlowNode[], using: LowerContext = context): LowerResult {
  return lower(automation(nodes), using);
}

export function planOf(nodes: FlowNode[], using: LowerContext = context): Plan {
  const result = run(nodes, using);
  if (!result.ok) throw new Error(JSON.stringify(result.problems));
  expect(PLAN.safeParse(result.plan).success).toBe(true);
  return result.plan;
}

export function opsOf(nodes: FlowNode[], using: LowerContext = context): PlanOp[] {
  const { body } = planOf(nodes, using);
  if (body.op !== 'seq') throw new Error('body is not a seq');
  return body.ops;
}

export function opOf(single: FlowNode, using: LowerContext = context): PlanOp {
  const [first] = opsOf([single], using);
  if (first === undefined) throw new Error('no op');
  return first;
}

export function problemsOf(nodes: FlowNode[], using: LowerContext = context): LowerProblem[] {
  const result = run(nodes, using);
  if (result.ok) throw new Error('expected problems');
  return [...result.problems];
}

export function codesOf(nodes: FlowNode[], using: LowerContext = context): string[] {
  const result = run(nodes, using);
  return result.ok ? [] : result.problems.map((problem) => problem.code);
}

export { automation, fn };
