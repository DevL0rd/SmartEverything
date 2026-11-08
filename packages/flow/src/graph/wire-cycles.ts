import type { GraphNode } from '@smarteverything/domain';
import { wireCycleProblem, type GraphProblem } from './problem-types';
import { outputsOf, type ExecGraph } from './regions';

export function wireCycles(graph: ExecGraph): readonly GraphProblem[] {
  const state = new Map<string, 'open' | 'done'>();
  const stack: string[] = [];
  const found: GraphProblem[] = [];
  const visit = (key: string): void => {
    state.set(key, 'open');
    stack.push(key);
    for (const { target, port } of outputsOf(graph, key)) {
      const seen = target === undefined ? 'done' : state.get(target);
      const loop = target === undefined ? [] : stack.slice(stack.indexOf(target));
      if (seen === 'open')
        found.push(wireCycleProblem(cycleNodes(graph, loop), { from: key, port }, graph.kinds));
      if (seen === undefined && target !== undefined) visit(target);
    }
    stack.pop();
    state.set(key, 'done');
  };
  for (const node of graph.exec) {
    if (!state.has(node.key)) visit(node.key);
  }
  return found;
}

function cycleNodes(graph: ExecGraph, keys: readonly string[]): GraphNode[] {
  return keys.flatMap((key) => {
    const node = graph.byKey.get(key);
    return node === undefined ? [] : [node];
  });
}
