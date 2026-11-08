import { appendTo } from '@smarteverything/domain';

export interface PostDomGraph {
  readonly end: string;
  readonly successors: ReadonlyMap<string, readonly string[]>;
}

function predecessorsOf(graph: PostDomGraph): ReadonlyMap<string, readonly string[]> {
  const predecessors = new Map<string, string[]>();
  for (const [from, targets] of graph.successors) {
    for (const target of targets) appendTo(predecessors, target, from);
  }
  return predecessors;
}

function finishOrderFromEnd(
  graph: PostDomGraph,
  predecessors: ReadonlyMap<string, readonly string[]>,
): readonly string[] {
  const seen = new Set<string>([graph.end]);
  const order: string[] = [];
  const visit = (key: string): void => {
    for (const before of predecessors.get(key) ?? []) {
      if (!seen.has(before)) {
        seen.add(before);
        visit(before);
      }
    }
    order.push(key);
  };
  visit(graph.end);
  return order;
}

export function immediatePostDominators(graph: PostDomGraph): ReadonlyMap<string, string> {
  const order = finishOrderFromEnd(graph, predecessorsOf(graph));
  const position = new Map(order.map((key, index) => [key, index]));
  const dominator = new Map<string, string>([[graph.end, graph.end]]);
  const rank = (key: string): number => position.get(key) ?? -1;
  const up = (key: string): string => dominator.get(key) ?? key;
  const intersect = (first: string, second: string): string => {
    let left = first;
    let right = second;
    while (left !== right) {
      while (rank(left) < rank(right)) left = up(left);
      while (rank(right) < rank(left)) right = up(right);
    }
    return left;
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (const key of [...order].reverse()) {
      if (key === graph.end) continue;
      const known = (graph.successors.get(key) ?? []).filter((target) => dominator.has(target));
      const [head, ...rest] = known;
      if (head === undefined) continue;
      const next = rest.reduce(intersect, head);
      if (dominator.get(key) !== next) {
        dominator.set(key, next);
        changed = true;
      }
    }
  }
  return dominator;
}
