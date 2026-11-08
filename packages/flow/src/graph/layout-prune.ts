import type { GraphNode, NodeKindLookup, ProgramV4 } from '@smarteverything/domain';
import type { Program } from '../program/walk';
import type { GraphProblem } from './problem-types';
import { structuredOf } from './structured-of';

function splitPort(port: string): readonly [string, string] {
  const at = port.indexOf(':');
  return at < 0 ? [port, ''] : [port.slice(0, at), port.slice(at + 1)];
}

function cutTo<T extends { readonly to?: string | undefined }>(
  rows: T[] | undefined,
  match: (row: T) => boolean,
): T[] | undefined {
  if (rows?.some((row) => match(row) && row.to !== undefined) !== true) return rows;
  return rows.map((row) => (match(row) ? { ...row, to: undefined } : row));
}

type RowField = 'branches' | 'cases' | 'catches' | 'paths';

function withRows<K extends RowField>(node: GraphNode, key: K, rows: GraphNode[K]): GraphNode {
  return rows === node[key] ? node : { ...node, [key]: rows };
}

const ROW_CUTS: Readonly<Record<string, (node: GraphNode, name: string) => GraphNode>> = {
  row: (node, name) =>
    withRows(
      node,
      'branches',
      cutTo(node.branches, (row) => row.id === name),
    ),
  case: (node, name) =>
    withRows(
      node,
      'cases',
      cutTo(node.cases, (row) => row.id === name),
    ),
  catch: (node, name) =>
    withRows(
      node,
      'catches',
      cutTo(node.catches, (row) => row.id === name),
    ),
  path: (node, name) =>
    withRows(
      node,
      'paths',
      cutTo(node.paths, (row) => row.name === name),
    ),
};

function omitKey(record: Readonly<Record<string, string>>, key: string): Record<string, string> {
  return Object.fromEntries(Object.entries(record).filter(([name]) => name !== key));
}

function cutWire(node: GraphNode, port: string): GraphNode {
  if (node.to?.[port] !== undefined) return { ...node, to: omitKey(node.to, port) };
  const [group, name] = splitPort(port);
  return ROW_CUTS[group]?.(node, name) ?? node;
}

export function pruned(
  program: ProgramV4,
  problems: readonly GraphProblem[],
): ProgramV4 | undefined {
  const dropped = new Set(
    problems.flatMap((p) => (p.wire === undefined && p.nodeId !== undefined ? [p.nodeId] : [])),
  );
  const cuts = problems.flatMap((p) => (p.wire === undefined ? [] : [p.wire]));
  const kept = program.nodes.filter((node) => !dropped.has(node.id));
  const nodes = kept.map((node) =>
    cuts.filter((cut) => cut.from === node.key).reduce((acc, cut) => cutWire(acc, cut.port), node),
  );
  const changed = kept.length !== program.nodes.length || nodes.some((node, i) => node !== kept[i]);
  return changed ? { ...program, nodes } : undefined;
}

export interface Structured {
  readonly program: ProgramV4;
  readonly tree: Program | undefined;
}

export function structuredPart(program: ProgramV4, kinds: NodeKindLookup): Structured {
  let current = program;
  for (;;) {
    const outcome = structuredOf(current, kinds);
    if (outcome.kind === 'structured') return { program: current, tree: outcome.tree };
    const next = pruned(current, outcome.problems);
    if (next === undefined) return { program: current, tree: undefined };
    current = next;
  }
}
