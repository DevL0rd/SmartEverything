import type { DOMProps } from 'expo/dom';
import type { Edge, Node } from '@xyflow/react';
import type { CanvasIntent, CanvasProps, SceneEdge, SceneNode } from '../../model/canvas/contract';

export interface CanvasNodeData extends Record<string, unknown> {
  readonly scene: SceneNode;
}

export type CanvasNode = Node<CanvasNodeData, SceneNode['role']>;

export interface CanvasEdgeData extends Record<string, unknown> {
  readonly scene: SceneEdge;
}

export type CanvasEdge = Edge<CanvasEdgeData, SceneEdge['kind']>;

export interface FlowCanvasProps extends CanvasProps {
  readonly onIntent: (intent: CanvasIntent) => Promise<void>;
  readonly dom?: DOMProps;
}
