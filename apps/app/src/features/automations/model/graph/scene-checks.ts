import type { EdgeEnd, GraphScene, GraphSceneEdge, GraphSceneNode } from './scene-contract';

export interface HandleProblem {
  readonly edgeId: string;
  readonly end: 'source' | 'target';
  readonly nodeId: string;
  readonly handle: string;
  readonly reason: 'no node' | 'no handle';
}

function rowHandles(node: GraphSceneNode): readonly string[] {
  return node.rows.map((row) => row.handle);
}

function conditionHandles(node: GraphSceneNode): readonly string[] {
  return node.rows.flatMap((row) => (row.condition === null ? [] : [row.condition.handle]));
}

function sourceHandles(node: GraphSceneNode, edge: GraphSceneEdge): readonly string[] {
  return edge.kind === 'exec' ? rowHandles(node) : node.outputs.map((pin) => pin.handle);
}

function targetHandles(node: GraphSceneNode, edge: GraphSceneEdge): readonly string[] {
  if (edge.kind === 'exec') return node.execIn === null ? [] : [node.execIn];
  return [...node.inputs.map((pin) => pin.handle), ...conditionHandles(node)];
}

function endProblem(
  edge: GraphSceneEdge,
  end: 'source' | 'target',
  node: GraphSceneNode | undefined,
): readonly HandleProblem[] {
  const at: EdgeEnd = edge[end];
  const declared =
    node === undefined
      ? []
      : end === 'source'
        ? sourceHandles(node, edge)
        : targetHandles(node, edge);
  if (node === undefined) {
    return [{ edgeId: edge.id, end, nodeId: at.nodeId, handle: at.handle, reason: 'no node' }];
  }
  return declared.includes(at.handle)
    ? []
    : [{ edgeId: edge.id, end, nodeId: at.nodeId, handle: at.handle, reason: 'no handle' }];
}

export function sceneEdgeHandleProblems(scene: GraphScene): readonly HandleProblem[] {
  const byId = new Map(scene.nodes.map((node) => [node.id, node]));
  return scene.edges.flatMap((edge) => [
    ...endProblem(edge, 'source', byId.get(edge.source.nodeId)),
    ...endProblem(edge, 'target', byId.get(edge.target.nodeId)),
  ]);
}

export function declaredHandles(node: GraphSceneNode): readonly string[] {
  return [
    ...(node.execIn === null ? [] : [node.execIn]),
    ...rowHandles(node),
    ...conditionHandles(node),
    ...node.inputs.map((pin) => pin.handle),
    ...node.outputs.map((pin) => pin.handle),
  ];
}

export function hiddenOutputs(node: GraphSceneNode): number {
  if (node.family === 'start') return 0;
  return node.outputs.filter((pin) => !pin.wired).length;
}

export function drawnHandles(node: GraphSceneNode): readonly string[] {
  const folded = new Set(
    hiddenOutputs(node) === 0
      ? []
      : node.outputs.filter((pin) => !pin.wired).map((pin) => pin.handle),
  );
  return declaredHandles(node).filter((handle) => !folded.has(handle));
}

export function duplicateHandles(scene: GraphScene): readonly string[] {
  return scene.nodes.flatMap((node) => {
    const seen = new Set<string>();
    return declaredHandles(node).flatMap((handle) => {
      const repeated = seen.has(handle);
      seen.add(handle);
      return repeated ? [`${node.id}: ${handle}`] : [];
    });
  });
}

export function duplicateEdgeIds(scene: GraphScene): readonly string[] {
  const seen = new Set<string>();
  return scene.edges.flatMap((edge) => {
    const repeated = seen.has(edge.id);
    seen.add(edge.id);
    return repeated ? [edge.id] : [];
  });
}
