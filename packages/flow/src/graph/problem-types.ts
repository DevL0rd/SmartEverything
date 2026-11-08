import { execPortsOf, type GraphNode, type NodeKindLookup } from '@smarteverything/domain';
import type { ExecGraph } from './regions';

export type GraphProblemCode =
  | 'wire_cycle'
  | 'crosses_region'
  | 'shared_branch_node'
  | 'path_not_joined'
  | 'join_mismatch'
  | 'exit_shape'
  | 'switch_all_early_end'
  | 'never_runs'
  | 'exec_into_start'
  | 'unknown_target'
  | 'loop_control_outside';

export interface GraphWire {
  readonly from: string;
  readonly port: string;
}

export interface GraphProblem {
  readonly code: GraphProblemCode;
  readonly nodeId?: string;
  readonly key?: string;
  readonly port?: string;
  readonly wire?: GraphWire;
  readonly message: string;
  readonly fix: string;
}

interface ProblemDetail {
  readonly port?: string;
  readonly wire?: GraphWire;
  readonly message: string;
  readonly fix: string;
}

const STRUCTURAL_NAMES: Readonly<Record<string, string>> = {
  'flow.start': 'Start',
  'flow.on_failure': 'On failure',
  'flow.join': 'Wait for all',
};

export function nodeName(node: GraphNode, kinds: NodeKindLookup): string {
  return node.label ?? STRUCTURAL_NAMES[node.kind] ?? kinds.get(node.kind)?.name ?? node.key;
}

export function portLabel(node: GraphNode, port: string, kinds: NodeKindLookup): string {
  const found = execPortsOf(node.kind, node, kinds).outputs.find((out) => out.port === port);
  return found?.label ?? port;
}

export function wireText(node: GraphNode, port: string, kinds: NodeKindLookup): string {
  return `${portLabel(node, port, kinds)} of ${nodeName(node, kinds)}`;
}

function problemOf(
  code: GraphProblemCode,
  node: GraphNode | undefined,
  detail: ProblemDetail,
): GraphProblem {
  return {
    code,
    ...(node === undefined ? {} : { nodeId: node.id, key: node.key }),
    ...(detail.port === undefined ? {} : { port: detail.port }),
    ...(detail.wire === undefined ? {} : { wire: detail.wire }),
    message: detail.message,
    fix: detail.fix,
  };
}

export function wireCycleProblem(
  cycle: readonly GraphNode[],
  closing: GraphWire,
  kinds: NodeKindLookup,
): GraphProblem {
  const [first] = cycle;
  const names = [...cycle, ...(first === undefined ? [] : [first])].map((node) =>
    nodeName(node, kinds),
  );
  return problemOf('wire_cycle', first, {
    wire: closing,
    message: `These wires go round in a circle: ${names.join(', ')}.`,
    fix: 'Use a loop node to repeat steps.',
  });
}

export function crossesRegionProblem(node: GraphNode, detail: ProblemDetail): GraphProblem {
  return problemOf('crosses_region', node, detail);
}

export type SharedShape =
  | { readonly kind: 'plain' }
  | { readonly kind: 'or' }
  | { readonly kind: 'early'; readonly guard: GraphNode; readonly via: string };

export interface SharedReach {
  readonly first: string;
  readonly second: { readonly text: string; readonly wire: GraphWire };
}

export function sharedBranchNodeProblem(
  node: GraphNode,
  { first, second }: SharedReach,
  shape: SharedShape,
  kinds: NodeKindLookup,
): GraphProblem {
  const name = nodeName(node, kinds);
  const guardName = shape.kind === 'early' ? nodeName(shape.guard, kinds) : '';
  if (shape.kind === 'early') {
    return problemOf('shared_branch_node', node, {
      wire: second.wire,
      message: `${name} is reached from both ${shape.via} and ${second.text}, but ${shape.via} can end early at ${guardName}.`,
      fix: `Wire Otherwise of ${guardName} to ${name}, or end both paths.`,
    });
  }
  return problemOf('shared_branch_node', node, {
    wire: second.wire,
    message: `${name} is reached from both ${first} and ${second.text}, which do not meet at it.`,
    fix:
      shape.kind === 'or'
        ? 'Combine the two conditions with an Or node and use one If.'
        : 'Make the two paths meet at one step before it, or end one of them.',
  });
}

export function neverRunsProblem(
  node: GraphNode,
  hasIncoming: boolean,
  kinds: NodeKindLookup,
): GraphProblem {
  const reason = hasIncoming
    ? 'the only wires into it come from steps that never run'
    : 'nothing leads to it';
  return problemOf('never_runs', node, {
    message: `${nodeName(node, kinds)} never runs: ${reason}.`,
    fix: 'Wire a Then into it, or delete it.',
  });
}

export function unknownTargetProblem(
  graph: Pick<ExecGraph, 'byKey' | 'kinds'>,
  node: GraphNode,
  port: string,
  target: string,
): GraphProblem {
  const { kinds } = graph;
  const reason = graph.byKey.has(target) ? 'which is not a step' : 'which does not exist';
  return problemOf('unknown_target', node, {
    port,
    wire: { from: node.key, port },
    message: `${wireText(node, port, kinds)} goes to ${target}, ${reason}.`,
    fix: 'Pick a step that exists.',
  });
}

export function joinMismatchProblem(node: GraphNode, detail: ProblemDetail): GraphProblem {
  return problemOf('join_mismatch', node, detail);
}

export function exitShapeProblem(node: GraphNode, detail: ProblemDetail): GraphProblem {
  return problemOf('exit_shape', node, detail);
}
