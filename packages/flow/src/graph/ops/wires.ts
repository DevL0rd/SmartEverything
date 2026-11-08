import {
  execPortsOf,
  type ExecOutput,
  type GraphNode,
  type NodeKindLookup,
  type ProgramV4,
} from '@smarteverything/domain';
import { execGraphOf, membershipOf } from '../regions';
import { refuse } from './result';
import { change } from './util';

export interface WireRef {
  readonly from: string;
  readonly port: string;
  readonly to: string;
}

export function outputsOfNode(node: GraphNode, kinds: NodeKindLookup): readonly ExecOutput[] {
  return execPortsOf(node.kind, node, kinds).outputs;
}

export function wiresOf(program: ProgramV4, kinds: NodeKindLookup): readonly WireRef[] {
  return program.nodes.flatMap((node) =>
    outputsOfNode(node, kinds).flatMap((out) =>
      out.target === undefined ? [] : [{ from: node.key, port: out.port, to: out.target }],
    ),
  );
}

export function wiresInto(
  program: ProgramV4,
  keys: ReadonlySet<string>,
  kinds: NodeKindLookup,
): readonly WireRef[] {
  return wiresOf(program, kinds).filter((wire) => keys.has(wire.to));
}

export function requireOutput(node: GraphNode, port: string, kinds: NodeKindLookup): ExecOutput {
  const outputs = outputsOfNode(node, kinds);
  const found = outputs.find((out) => out.port === port);
  if (found !== undefined) return found;
  const known = outputs.map((out) => out.port).join(', ');
  return refuse(
    'unknown_port',
    `"${node.key}" has no exit "${port}"${known === '' ? ', it has no exits' : `, its exits are: ${known}`}`,
  );
}

interface RowTarget {
  to?: string | undefined;
}

const ROW_PREFIXES = ['row:', 'case:', 'catch:', 'path:'] as const;

function rowOf(
  node: GraphNode,
  prefix: (typeof ROW_PREFIXES)[number],
  name: string,
): RowTarget | undefined {
  switch (prefix) {
    case 'row:':
      return node.branches?.find((row) => row.id === name);
    case 'case:':
      return node.cases?.find((row) => row.id === name);
    case 'catch:':
      return node.catches?.find((row) => row.id === name);
    case 'path:':
      return node.paths?.find((row) => row.name === name);
  }
}

function rowTarget(node: GraphNode, port: string): RowTarget | undefined {
  const prefix = ROW_PREFIXES.find((candidate) => port.startsWith(candidate));
  if (prefix === undefined) return undefined;
  return rowOf(node, prefix, port.slice(prefix.length));
}

export function setTarget(node: GraphNode, port: string, target: string | undefined): void {
  const row = rowTarget(node, port);
  if (row !== undefined) {
    if (target === undefined) Reflect.deleteProperty(row, 'to');
    else row.to = target;
    return;
  }
  const to: Record<string, string> = { ...node.to };
  if (target === undefined) Reflect.deleteProperty(to, port);
  else to[port] = target;
  if (Object.keys(to).length === 0) Reflect.deleteProperty(node, 'to');
  else change(node, { to });
}

export function joinOfFork(
  program: ProgramV4,
  fork: string,
  kinds: NodeKindLookup,
): string | undefined {
  return membershipOf(execGraphOf(program, kinds)).joinOf.get(fork);
}

export function forkOfJoin(
  program: ProgramV4,
  join: string,
  kinds: NodeKindLookup,
): string | undefined {
  const joins = membershipOf(execGraphOf(program, kinds)).joinOf;
  return [...joins.entries()].find(([, candidate]) => candidate === join)?.[0];
}
