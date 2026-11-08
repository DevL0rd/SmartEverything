import { SelectionMode, type ReactFlowProps } from '@xyflow/react';
import { GRAPH_EDGE_TYPES } from './edges/edge-types';
import type { GraphFlowEdge, GraphFlowNode } from './graph-canvas-types';
import { GRAPH_ARIA_LABELS } from './keyboard/node-names';
import { GRAPH_NODE_TYPES } from './node-registry';

export const CONNECT_RADIUS = 40;

export const FLOW_PROPS: Partial<ReactFlowProps<GraphFlowNode, GraphFlowEdge>> = {
  nodeTypes: GRAPH_NODE_TYPES,
  edgeTypes: GRAPH_EDGE_TYPES,
  nodesFocusable: true,
  disableKeyboardA11y: true,
  ariaLabelConfig: GRAPH_ARIA_LABELS,
  edgesFocusable: false,
  panOnDrag: true,
  zoomOnScroll: false,
  zoomOnPinch: true,
  zoomOnDoubleClick: false,
  selectionKeyCode: 'Shift',
  multiSelectionKeyCode: ['Control', 'Meta'],
  selectionMode: SelectionMode.Partial,
  connectOnClick: false,
  connectionRadius: CONNECT_RADIUS,
  deleteKeyCode: null,
  proOptions: { hideAttribution: true },
};
