import type { FlowNode } from '@smarteverything/domain';
import type { Program, WalkedNode } from '../program/walk';
import { walkProgram } from '../program/walk';

export const CALL_KIND = 'fn.call';

export interface CallRef {
  readonly key: string;
  readonly nodeId: string;
  readonly functionId: string;
  readonly pin: number | undefined;
}

function literal(node: FlowNode, port: string): unknown {
  const value = node.ports?.[port];
  return value !== undefined && 'lit' in value ? value.lit : undefined;
}

export function functionIdOf(node: FlowNode): string | undefined {
  const value = literal(node, 'fn');
  return typeof value === 'string' && value !== '' ? value : undefined;
}

export function pinOf(node: FlowNode): number | undefined {
  if (node.pin !== undefined) return node.pin.revision;
  const value = literal(node, 'pin');
  return typeof value === 'number' ? value : undefined;
}

export function callInstances(program: Program): readonly WalkedNode[] {
  return walkProgram(program).filter((entry) => entry.node.kind === CALL_KIND);
}

export function callsOf(program: Program): readonly CallRef[] {
  return callInstances(program).flatMap(({ node }) => {
    const functionId = functionIdOf(node);
    return functionId === undefined
      ? []
      : [{ key: node.key, nodeId: node.id, functionId, pin: pinOf(node) }];
  });
}
