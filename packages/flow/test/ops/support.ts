import type { AutomationV3, FlowNode, PortValue, TriggerNode } from '@smarteverything/domain';
import { expect } from 'vitest';
import type { Program } from '../../src/program/walk';
import { applyPatch, type PatchResult } from '../../src/ops/reducer';
import type { PatchOp } from '../../src/ops/schema';
import { automation, fn, node, uuid } from '../functions/support';

export { automation, fn, node, uuid };

let counter = 0;

export function newId(): string {
  counter += 1;
  return `11111111-1111-4111-8111-${counter.toString(16).padStart(12, '0')}`;
}

export function trigger(key: string, ports: Record<string, PortValue> = {}): TriggerNode {
  return { id: uuid(), key, kind: 'trigger.signal', ports };
}

export function withTriggers(base: AutomationV3, ...triggers: TriggerNode[]): AutomationV3 {
  return { ...base, triggers };
}

export function loop(key: string, body: FlowNode[], ports?: Record<string, PortValue>): FlowNode {
  return {
    ...node(key, 'flow.repeat', ports ?? { times: { lit: 2 } }),
    scopes: { body: { nodes: body } },
  };
}

export function branching(key: string, when: PortValue, inside: FlowNode[]): FlowNode {
  return {
    ...node(key, 'flow.if'),
    branches: [{ id: uuid(), when, scope: { nodes: inside } }],
  };
}

export function ok(program: Program, ops: readonly PatchOp[]): Extract<PatchResult, { ok: true }> {
  const result = applyPatch(program, ops, { newId });
  if (!result.ok) throw new Error(`refused: ${result.code} ${result.reason}`);
  return result;
}

export function refused(
  program: Program,
  ops: readonly PatchOp[],
): { code: string; reason: string } {
  const result = applyPatch(program, ops, { newId });
  if (result.ok) throw new Error('expected a refusal');
  return { code: result.code, reason: result.reason };
}

export function roundTrip(program: Program, ops: readonly PatchOp[]): Program {
  const applied = ok(program, ops);
  const undone = ok(applied.program, applied.inverse);
  expect(undone.program).toEqual(program);
  return applied.program;
}

export function bodyKeys(program: Program): string[] {
  return program.body.nodes.map((entry) => entry.key);
}
