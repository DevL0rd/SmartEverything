import type { DOMProps } from 'expo/dom';
import type { Edge, Node } from '@xyflow/react';
import type { GraphRunOverlay } from '../../model/graph/run-overlay';
import type { GraphFraming, ViewportCommand } from './viewport';
import type { WireBox, WirePoints } from './edges/exec-route';
import type {
  EdgeEnd,
  GraphScene,
  GraphSceneEdge,
  GraphSceneNode,
  SceneFamily,
} from '../../model/graph/scene-contract';

export type GraphIdiom = 'touch' | 'pointer';

export const SHORTCUT_NAMES = [
  'undo',
  'redo',
  'copy',
  'cut',
  'paste',
  'duplicate',
  'selectAll',
  'group',
] as const;

export type ShortcutName = (typeof SHORTCUT_NAMES)[number];

export interface GraphCanvasMetrics {
  readonly width: number;
  readonly height: number;
}

export interface GraphMeasuredSize {
  readonly id: string;
  readonly w: number;
  readonly h: number;
}

export interface GraphPoint {
  readonly x: number;
  readonly y: number;
}

export interface GraphPlacement extends GraphPoint {
  readonly id: string;
}

export type GraphMoveRequest =
  | { readonly kind: 'drag'; readonly moves: readonly GraphPlacement[] }
  | {
      readonly kind: 'nudge';
      readonly ids: readonly string[];
      readonly dx: number;
      readonly dy: number;
    };

export type GraphDisconnectRequest =
  | { readonly kind: 'exec'; readonly from: EdgeEnd }
  | { readonly kind: 'value'; readonly target: EdgeEnd };

export type GraphCanvasIntent =
  | { readonly type: 'select'; readonly ids: readonly string[] }
  | { readonly type: 'ready'; readonly metrics: GraphCanvasMetrics }
  | { readonly type: 'measured'; readonly sizes: readonly GraphMeasuredSize[] }
  | { readonly type: 'addPath'; readonly nodeId: string }
  | { readonly type: 'stepPass'; readonly nodeId: string; readonly delta: -1 | 1 }
  | {
      readonly type: 'connect';
      readonly request: { readonly from: EdgeEnd; readonly to: EdgeEnd };
    }
  | { readonly type: 'disconnect'; readonly request: GraphDisconnectRequest }
  | { readonly type: 'delete'; readonly request: { readonly ids: readonly string[] } }
  | { readonly type: 'move'; readonly request: GraphMoveRequest }
  | {
      readonly type: 'dropEmpty';
      readonly from: EdgeEnd;
      readonly point: GraphPoint;
      readonly screen: GraphPoint;
    }
  | { readonly type: 'insertOnWire'; readonly from: EdgeEnd }
  | { readonly type: 'addTrigger' }
  | { readonly type: 'open'; readonly nodeId: string }
  | { readonly type: 'shortcut'; readonly name: ShortcutName }
  | { readonly type: 'viewportSettled' }
  | { readonly type: 'escape' };

export interface GraphIntentFeedback {
  readonly announcement: string;
  readonly toast: string | null;
  readonly failed: boolean;
}

export interface GraphNodeData extends Record<string, unknown> {
  readonly scene: GraphSceneNode;
  readonly incoming: readonly string[];
}

export type GraphFlowNode = Node<GraphNodeData, SceneFamily>;

export interface GraphEdgeData extends Record<string, unknown> {
  readonly scene: GraphSceneEdge;
  readonly points: WirePoints | null;
  readonly around: readonly WireBox[];
  readonly wires: readonly WirePoints[];
  readonly shift: number;
}

export type GraphFlowEdge = Edge<GraphEdgeData>;

export interface GraphDropGhost {
  readonly nodeId: string;
  readonly handle: string;
  readonly side: 'in' | 'out';
  readonly x: number;
  readonly y: number;
}

export interface GraphCanvasProps {
  readonly scene: GraphScene;
  readonly ghost: GraphDropGhost | null;
  readonly run: GraphRunOverlay | null;
  readonly selection: readonly string[];
  readonly focusNode: string | null;
  readonly viewportCommand: ViewportCommand | null;
  readonly active: boolean;
  readonly readOnly: boolean;
  readonly framing: GraphFraming;
  readonly idiom: GraphIdiom;
  readonly theme: Readonly<Record<string, string>>;
  readonly onIntent: (intent: GraphCanvasIntent) => Promise<GraphIntentFeedback | null>;
  readonly dom?: DOMProps;
}
