import { useMemo } from 'react';
import type { Connection, Edge, FinalConnectionState, Viewport } from '@xyflow/react';
import { background } from '@smarteverything/logging';
import type { CanvasIntent } from '../../model/canvas/contract';
import { useStableCallback } from '../../../../design/use-stable-callback';
import type { CanvasEdge, CanvasNode } from './canvas-types';
import { portKey, type Flow } from './scene-flow';

const TOUCH_DRAG_THRESHOLD = 8;
const POINTER_DRAG_THRESHOLD = 3;

type Emit = (intent: CanvasIntent) => void;

interface NodeHandlers {
  readonly onNodeClick: (event: unknown, node: CanvasNode) => void;
  readonly onNodeDoubleClick: (event: unknown, node: CanvasNode) => void;
  readonly onEdgeClick: (event: unknown, edge: CanvasEdge) => void;
  readonly onNodeDragStop: (event: unknown, node: CanvasNode, dragged: CanvasNode[]) => void;
  readonly onMoveEnd: (event: unknown, viewport: Viewport) => void;
  readonly nodeDragThreshold: number;
}

interface ConnectHandlers {
  readonly onConnect: (connection: Connection) => void;
  readonly onConnectEnd: (event: unknown, state: FinalConnectionState) => void;
  readonly isValidConnection: (connection: Connection | Edge) => boolean;
}

export type CanvasHandlers = NodeHandlers & ConnectHandlers;

export function selectionKey(ids: readonly string[]): string {
  return [...ids].sort().join(',');
}

function useNodeHandlers(emit: Emit, idiom: 'touch' | 'pointer'): NodeHandlers {
  return useMemo(
    () => ({
      nodeDragThreshold: idiom === 'touch' ? TOUCH_DRAG_THRESHOLD : POINTER_DRAG_THRESHOLD,
      onNodeClick: (_event: unknown, node: CanvasNode): void => {
        if (node.data.scene.role === 'slot') emit({ type: 'openSlot', slotId: node.id });
      },
      onNodeDoubleClick: (_event: unknown, node: CanvasNode): void => {
        if (node.data.scene.role !== 'slot') emit({ type: 'openNode', id: node.id });
      },
      onEdgeClick: (_event: unknown, edge: CanvasEdge): void => {
        if (edge.data?.scene.kind === 'exec') emit({ type: 'insertOnEdge', edgeId: edge.id });
      },
      onNodeDragStop: (_event: unknown, _node: CanvasNode, dragged: CanvasNode[]): void => {
        const patches = dragged.map(({ id, position }) => ({ id, x: position.x, y: position.y }));
        if (patches.length > 0) emit({ type: 'move', patches });
      },
      onMoveEnd: (_event: unknown, viewport: Viewport): void => {
        emit({ type: 'viewportSettled', viewport });
      },
    }),
    [emit, idiom],
  );
}

function useConnectHandlers(emit: Emit, flow: Flow): ConnectHandlers {
  const ports = useStableCallback(() => flow.valuePorts);
  return useMemo(
    () => ({
      onConnect: ({ source, sourceHandle, target, targetHandle }: Connection): void => {
        if (sourceHandle === null || targetHandle === null) return;
        emit({
          type: 'connect',
          connection: {
            from: { nodeId: source, port: sourceHandle },
            to: { nodeId: target, port: targetHandle },
          },
        });
      },
      onConnectEnd: (_event: unknown, state: FinalConnectionState): void => {
        const { fromHandle, to } = state;
        if (state.isValid === true || fromHandle === null) return;
        const port = fromHandle.id;
        if (port === null || port === undefined) return;
        if (ports().get(portKey(fromHandle.nodeId, port)) !== 'out') return;
        emit({
          type: 'portDropEmpty',
          from: { nodeId: fromHandle.nodeId, port },
          point: { x: to.x, y: to.y },
        });
      },
      isValidConnection: ({ source, sourceHandle, target, targetHandle }): boolean =>
        sourceHandle !== null &&
        sourceHandle !== undefined &&
        targetHandle !== null &&
        targetHandle !== undefined &&
        source !== target &&
        ports().get(portKey(source, sourceHandle)) === 'out' &&
        ports().get(portKey(target, targetHandle)) === 'in',
    }),
    [emit, ports],
  );
}

export function useEmit(send: (intent: CanvasIntent) => Promise<void>): Emit {
  return useStableCallback((intent: CanvasIntent): void => {
    background(send(intent), 'automations.canvas.intent', { intent: intent.type });
  });
}

export function useCanvasIntents(
  emit: Emit,
  flow: Flow,
  idiom: 'touch' | 'pointer',
): CanvasHandlers {
  const nodes = useNodeHandlers(emit, idiom);
  const connect = useConnectHandlers(emit, flow);
  return useMemo(() => ({ ...nodes, ...connect }), [nodes, connect]);
}
