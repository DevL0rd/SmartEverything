import type { AriaLabelConfig } from '@xyflow/react';
import { a11yNames } from '../../../model/graph/a11y-names';
import type { GraphScene } from '../../../model/graph/scene-contract';
import type { GraphFlowNode } from '../graph-canvas-types';

export const GRAPH_ARIA_LABELS: Partial<AriaLabelConfig> = {
  'node.a11yDescription.default':
    'Press Enter to open the details, Space to select, arrow keys to follow the wires, Alt and an arrow key to move.',
  'node.a11yDescription.keyboardDisabled':
    'Press Enter to open the details, Space to select, arrow keys to follow the wires, Alt and an arrow key to move.',
  'node.a11yDescription.ariaLiveMessage': () => '',
  'edge.a11yDescription.default': '',
  'handle.ariaLabel': '',
  'minimap.ariaLabel': 'Overview of the automation',
};

export function withNames(nodes: GraphFlowNode[], scene: GraphScene): GraphFlowNode[] {
  const names = a11yNames(scene);
  return nodes.map((node) => ({ ...node, ariaLabel: names.get(node.id) ?? node.data.scene.title }));
}
