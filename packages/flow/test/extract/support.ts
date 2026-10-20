import type {
  AutomationV3,
  FlowNode,
  FunctionV3,
  JsonValue,
  PortValue,
} from '@smarteverything/domain';
import { context } from '../check/c23-support';
import type { DetachResult } from '../../src/extract/detach';
import { detachInstance } from '../../src/extract/detach';
import type { ExtractResult, Extraction } from '../../src/extract/extract';
import { extractRegion } from '../../src/extract/extract';
import type { Refusal } from '../../src/extract/result';
import type { Program } from '../../src/program/walk';
import { automation, functionProgram, node, trigger } from '../check/c23-support';

export { automation, functionProgram, node, trigger };

let counter = 0;

export function newId(): string {
  counter += 1;
  return `22222222-2222-4222-8222-${counter.toString(16).padStart(12, '0')}`;
}

export const CTX = context();

export const FUNCTION_ID = '33333333-3333-4333-8333-333333333333';

export const lit = (value: JsonValue): PortValue => ({ lit: value });
export const wired = (reference: string): PortValue => {
  const [from = '', port = ''] = reference.split('.');
  return { wire: { from, port } };
};

export function probe(key: string, ports: Record<string, PortValue> = {}): FlowNode {
  return node(key, 'probe.take', { need: { lit: 'x' }, ...ports });
}

function extract(program: Program, selection: readonly string[], name = 'Make tea'): ExtractResult {
  return extractRegion(program, selection, CTX, { functionId: FUNCTION_ID, name, newId });
}

export function extracted(program: Program, selection: readonly string[]): Extraction {
  const result = extract(program, selection);
  if (!result.ok) throw new Error(`refused: ${result.code} ${result.reason}`);
  return result;
}

export function refusal(program: Program, selection: readonly string[]): Refusal {
  const result = extract(program, selection);
  if (result.ok) throw new Error('expected a refusal');
  return result;
}

export function detached(program: Program, key: string, callee: FunctionV3): Program {
  const result: DetachResult = detachInstance(program, key, callee, { newId });
  if (!result.ok) throw new Error(`refused: ${result.code} ${result.reason}`);
  return result.program;
}

export function detachRefusal(program: Program, key: string, callee: FunctionV3): Refusal {
  const result = detachInstance(program, key, callee, { newId });
  if (result.ok) throw new Error('expected a refusal');
  return result;
}

export function keysOf(program: Program): string[] {
  return program.body.nodes.map((entry) => entry.key);
}

function press(): ReturnType<typeof trigger> {
  return trigger('press', 'trigger.signal', { source: lit('home'), kind: lit('tick') });
}

export function withPress(base: AutomationV3): AutomationV3 {
  return { ...base, triggers: [press()] };
}

export function pure(key: string, reads?: string): FlowNode {
  return node(key, 'math.add', { a: reads === undefined ? lit(1) : wired(reads), b: lit(1) });
}

export function giveBack(ports: Record<string, PortValue> = {}, key = 'give'): FlowNode {
  return node(key, 'flow.return', ports);
}

export function repeating(key: string, inside: FlowNode[]): FlowNode {
  return { ...node(key, 'flow.repeat', { times: lit(2) }), scopes: { body: { nodes: inside } } };
}

export function branching(key: string, inside: FlowNode[]): FlowNode {
  return {
    ...node(key, 'flow.if'),
    branches: [{ id: newId(), when: lit(true), scope: { nodes: inside } }],
  };
}

export function portAt(program: Program, index: number, name: string): PortValue | undefined {
  return program.body.nodes[index]?.ports?.[name];
}
