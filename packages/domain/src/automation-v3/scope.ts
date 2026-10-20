import type { FlowNode, Scope } from './node';

export type PathSegment = string | number;

export interface ChildScope {
  readonly scope: Scope;
  readonly path: readonly PathSegment[];
}

export interface VisitedNode {
  readonly node: FlowNode;
  readonly path: readonly PathSegment[];
}

export function childScopes(node: FlowNode): readonly ChildScope[] {
  const named = Object.entries(node.scopes ?? {}).map(([name, scope]) => ({
    scope,
    path: ['scopes', name],
  }));
  const rows = [
    ...(node.branches ?? []).map((row, index) => ({
      scope: row.scope,
      path: ['branches', index, 'scope'],
    })),
    ...(node.cases ?? []).map((row, index) => ({
      scope: row.scope,
      path: ['cases', index, 'scope'],
    })),
    ...(node.catches ?? []).map((row, index) => ({
      scope: row.scope,
      path: ['catches', index, 'scope'],
    })),
  ];
  return [...named, ...rows];
}

export function visitNodes(
  scope: Scope,
  scopePath: readonly PathSegment[],
): readonly VisitedNode[] {
  const visited: VisitedNode[] = [];
  scope.nodes.forEach((node, index) => {
    const path = [...scopePath, 'nodes', index];
    visited.push({ node, path });
    for (const child of childScopes(node)) {
      visited.push(...visitNodes(child.scope, [...path, ...child.path]));
    }
  });
  return visited;
}
