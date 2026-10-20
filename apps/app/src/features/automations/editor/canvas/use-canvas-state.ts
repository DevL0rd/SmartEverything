import { useMemo, useState } from 'react';
import { applyNodeChanges, type NodeChange } from '@xyflow/react';
import type { Scene } from '../../model/canvas/contract';
import type { CanvasNode } from './canvas-types';
import { selectionKey } from './use-canvas-intents';
import { buildFlow, type Flow } from './scene-flow';

export interface CanvasState {
  readonly flow: Flow;
  readonly nodes: CanvasNode[];
  readonly onNodesChange: (changes: NodeChange<CanvasNode>[]) => void;
}

export function selectedAfter(
  nodes: readonly CanvasNode[],
  changes: readonly NodeChange<CanvasNode>[],
): readonly string[] {
  const ids = new Set(nodes.filter((node) => node.selected === true).map((node) => node.id));
  for (const change of changes) {
    if (change.type !== 'select') continue;
    if (change.selected) ids.add(change.id);
    else ids.delete(change.id);
  }
  return [...ids];
}

function withSelection(nodes: CanvasNode[], key: string): CanvasNode[] {
  const ids = new Set(key === '' ? [] : key.split(','));
  return nodes.map((node) =>
    (node.selected === true) === ids.has(node.id) ? node : { ...node, selected: ids.has(node.id) },
  );
}

export function useCanvasState(
  scene: Scene,
  selection: readonly string[],
  onSelect: (ids: readonly string[]) => void,
): CanvasState {
  const sceneKey = useMemo(() => JSON.stringify(scene), [scene]);
  const [shown, setShown] = useState(() => ({ key: sceneKey, flow: buildFlow(scene, selection) }));
  const [nodes, setNodes] = useState<CanvasNode[]>(() => shown.flow.nodes);
  if (shown.key !== sceneKey) {
    const flow = buildFlow(scene, selection);
    setShown({ key: sceneKey, flow });
    setNodes(flow.nodes);
  }
  const wanted = selectionKey(selection);
  const [shownSelection, setShownSelection] = useState(wanted);
  if (shownSelection !== wanted) {
    setShownSelection(wanted);
    setNodes((current) => withSelection(current, wanted));
  }
  return {
    flow: shown.flow,
    nodes,
    onNodesChange: (changes): void => {
      setNodes((current) => applyNodeChanges(changes, current));
      if (!changes.some((change) => change.type === 'select')) return;
      const ids = selectedAfter(nodes, changes);
      if (selectionKey(ids) !== wanted) onSelect(ids);
    },
  };
}
