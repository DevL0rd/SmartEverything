import type { NodeChange } from '@xyflow/react';
import type { GraphFlowNode, GraphMeasuredSize } from './graph-canvas-types';

const TOLERANCE = 0.5;

export function measuredSizes(
  changes: readonly NodeChange<GraphFlowNode>[],
  nodes: readonly GraphFlowNode[],
): readonly GraphMeasuredSize[] {
  const byId = new Map(nodes.map((node) => [node.id, node.data.scene]));
  return changes.flatMap((change): GraphMeasuredSize[] => {
    if (change.type !== 'dimensions' || change.dimensions === undefined) return [];
    const scene = byId.get(change.id);
    const { width, height } = change.dimensions;
    if (scene === undefined || width <= 0 || height <= 0) return [];
    const same = Math.abs(scene.w - width) < TOLERANCE && Math.abs(scene.h - height) < TOLERANCE;
    return same ? [] : [{ id: change.id, w: width, h: height }];
  });
}
