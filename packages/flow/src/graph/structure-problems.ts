import {
  execClassOf,
  type ExecOutput,
  type GraphNode,
  type NodeKindLookup,
} from '@smarteverything/domain';
import {
  crossesRegionProblem,
  exitShapeProblem,
  joinMismatchProblem,
  neverRunsProblem,
  nodeName,
  portLabel,
  sharedBranchNodeProblem,
  unknownTargetProblem,
  wireCycleProblem,
  wireText,
  type GraphProblem,
  type GraphProblemCode,
  type SharedShape,
} from './problem-types';
import { outputsOf, type ExecGraph, type Membership, type Region, type Wire } from './regions';

const LOOP_KINDS: ReadonlySet<string> = new Set([
  'flow.for_each',
  'flow.repeat',
  'flow.for_range',
  'flow.while',
  'flow.do_until',
  'flow.forever',
]);

const LOOP_CONTROL_KINDS: ReadonlySet<string> = new Set(['flow.break', 'flow.continue']);

const ROOT_CLASSES: ReadonlySet<string> = new Set(['start', 'failure']);

export function pathNotJoinedProblem(
  fork: GraphNode,
  path: ExecOutput,
  join: GraphNode,
  kinds: NodeKindLookup,
): GraphProblem {
  return {
    code: 'path_not_joined',
    nodeId: fork.id,
    key: fork.key,
    port: path.port,
    wire: { from: fork.key, port: path.port },
    message: `Path ${path.label} of ${nodeName(fork, kinds)} ends before ${nodeName(join, kinds)}.`,
    fix: `Wire its last step into ${nodeName(join, kinds)}.`,
  };
}

export function memoryExitProblem(
  node: GraphNode,
  out: ExecOutput,
  back: GraphNode | undefined,
  kinds: NodeKindLookup,
): GraphProblem {
  const label = portLabel(node, out.port, kinds);
  const target = back === undefined ? 'the end' : nodeName(back, kinds);
  return exitShapeProblem(node, {
    port: out.port,
    wire: { from: node.key, port: out.port },
    message: `${wireText(node, out.port, kinds)} must lead back to ${target} or end.`,
    fix: `Wire the ${label} path back to ${target}, or leave it unwired.`,
  });
}

export function guardNeedsConditionProblem(node: GraphNode, kinds: NodeKindLookup): GraphProblem {
  return exitShapeProblem(node, {
    port: 'otherwise',
    wire: { from: node.key, port: 'otherwise' },
    message: `${nodeName(node, kinds)} sends Otherwise to its own steps but has no condition.`,
    fix: 'Wire a condition into it, or leave Otherwise unwired.',
  });
}

export function switchEarlyEndProblem(
  node: GraphNode,
  out: ExecOutput,
  merge: GraphNode,
  kinds: NodeKindLookup,
): GraphProblem {
  return {
    code: 'switch_all_early_end',
    nodeId: node.id,
    key: node.key,
    port: out.port,
    wire: { from: node.key, port: out.port },
    message: `${wireText(node, out.port, kinds)} ends early; every case must lead to ${nodeName(merge, kinds)}.`,
    fix: `Wire the case to ${nodeName(merge, kinds)}.`,
  };
}

export function execIntoStartProblem(
  target: GraphNode,
  from: GraphNode,
  port: string,
  kinds: NodeKindLookup,
): GraphProblem {
  return {
    code: 'exec_into_start',
    nodeId: target.id,
    key: target.key,
    wire: { from: from.key, port },
    message: `Nothing can lead into ${nodeName(target, kinds)}.`,
    fix: 'Remove the wire; the editor does not allow it.',
  };
}

export function loopControlProblem(
  node: GraphNode,
  fork: GraphNode | undefined,
  kinds: NodeKindLookup,
): GraphProblem {
  const base = { code: 'loop_control_outside', nodeId: node.id, key: node.key } as const;
  if (fork === undefined) {
    return {
      ...base,
      message: `${nodeName(node, kinds)} is not inside a loop.`,
      fix: 'Move it into the Each item path of a loop.',
    };
  }
  return {
    ...base,
    message: `${nodeName(node, kinds)} is inside a path of ${nodeName(fork, kinds)}, which cannot reach the loop around it.`,
    fix: 'Move it into the Each item path of a loop that sits inside this path.',
  };
}

export const GRAPH_PROBLEMS = {
  wire_cycle: wireCycleProblem,
  crosses_region: crossesRegionProblem,
  shared_branch_node: sharedBranchNodeProblem,
  path_not_joined: pathNotJoinedProblem,
  join_mismatch: joinMismatchProblem,
  exit_shape: exitShapeProblem,
  switch_all_early_end: switchEarlyEndProblem,
  never_runs: neverRunsProblem,
  exec_into_start: execIntoStartProblem,
  unknown_target: unknownTargetProblem,
  loop_control_outside: loopControlProblem,
} satisfies Record<GraphProblemCode, unknown>;

export function execIntoRoots(graph: ExecGraph): readonly GraphProblem[] {
  return graph.exec.flatMap((node) =>
    outputsOf(graph, node.key).flatMap((out) => {
      const target = out.target === undefined ? undefined : graph.byKey.get(out.target);
      if (target === undefined || !ROOT_CLASSES.has(execClassOf(target.kind, graph.kinds)))
        return [];
      return [execIntoStartProblem(target, node, out.port, graph.kinds)];
    }),
  );
}

interface LoopReach {
  readonly loop: boolean;
  readonly fork: GraphNode | undefined;
}

function opensLoop(owner: GraphNode | undefined, region: Region): boolean {
  return region.kind === 'lane' && region.port === 'body' && LOOP_KINDS.has(owner?.kind ?? '');
}

function loopReach(graph: ExecGraph, membership: Membership, key: string): LoopReach {
  let region = membership.regions.get(membership.regionOf.get(key) ?? '');
  while (region !== undefined) {
    const owner = region.owner === undefined ? undefined : graph.byKey.get(region.owner);
    if (opensLoop(owner, region)) return { loop: true, fork: undefined };
    if (region.kind === 'path') return { loop: false, fork: owner };
    region = region.parent === undefined ? undefined : membership.regions.get(region.parent);
  }
  return { loop: false, fork: undefined };
}

export function loopControlOutside(
  graph: ExecGraph,
  membership: Membership,
): readonly GraphProblem[] {
  return graph.exec
    .filter((node) => LOOP_CONTROL_KINDS.has(node.kind))
    .flatMap((node) => {
      const reach = loopReach(graph, membership, node.key);
      return reach.loop ? [] : [loopControlProblem(node, reach.fork, graph.kinds)];
    });
}

function isBranchWire(graph: ExecGraph, wire: Wire): boolean {
  return outputsOf(graph, wire.key).some((out) => out.port === wire.port && out.role === 'branch');
}

export function sharedShapeOf(
  graph: ExecGraph,
  visited: ReadonlyMap<string, Wire>,
  wires: { readonly first: Wire; readonly second: Wire },
): SharedShape {
  const { first, second } = wires;
  const guard = graph.byKey.get(first.key);
  const entered = visited.get(first.key);
  const enteredBy = entered === undefined ? undefined : graph.byKey.get(entered.key);
  if (guard?.kind === 'flow.guard' && entered !== undefined && enteredBy !== undefined) {
    return { kind: 'early', guard, via: wireText(enteredBy, entered.port, graph.kinds) };
  }
  const bothBranches = isBranchWire(graph, first) && isBranchWire(graph, second);
  return { kind: bothBranches && first.key !== second.key ? 'or' : 'plain' };
}
