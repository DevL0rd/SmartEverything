import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from 'react';
import { useReactFlow, type FinalConnectionState, type OnConnectStartParams } from '@xyflow/react';
import type { EdgeEnd } from '../../../model/graph/scene-contract';
import type {
  GraphCanvasIntent,
  GraphFlowEdge,
  GraphFlowNode,
  GraphIdiom,
  GraphPoint,
} from '../graph-canvas-types';
import { useStableCallback } from '../../../../../design/use-stable-callback';
import {
  POINTER_SLOP,
  TOUCH_SLOP,
  clientPointOf,
  isTap,
  resolveDrop,
  type Card,
  type ConnectAction,
  type PointerLike,
} from './connect-controller';
import { reduceTap, tapConsumed, tapTargetOf } from './tap-to-connect';

interface Gesture {
  readonly source: EdgeEnd;
  readonly at: { readonly x: number; readonly y: number };
}

export interface GraphConnect {
  readonly armed: EdgeEnd | null;
  readonly cancel: () => void;
  readonly onConnectStart: (event: PointerLike, params: OnConnectStartParams) => void;
  readonly onConnectEnd: (event: PointerLike, state: FinalConnectionState) => void;
  readonly onTapCapture: (event: ReactMouseEvent) => void;
  readonly onPaneClick: () => void;
}

export function cardsOf(nodes: readonly GraphFlowNode[]): readonly Card[] {
  return nodes.map((node) => ({
    id: node.id,
    x: node.position.x,
    y: node.position.y,
    w: node.measured?.width ?? node.data.scene.w,
    h: node.measured?.height ?? node.data.scene.h,
    scene: node.data.scene,
  }));
}

export function intentOf(action: ConnectAction): GraphCanvasIntent | null {
  if (action.kind === 'connect') {
    return { type: 'connect', request: { from: action.from, to: action.to } };
  }
  return action.kind === 'dropEmpty'
    ? { type: 'dropEmpty', from: action.from, point: action.point, screen: action.screen }
    : null;
}

function useArmedRing(root: RefObject<HTMLElement | null>, armed: EdgeEnd | null): void {
  useEffect(() => {
    const element = root.current;
    if (element === null || armed === null) return undefined;
    const handle = element.querySelector(
      `.react-flow__handle[data-nodeid="${CSS.escape(armed.nodeId)}"][data-handleid="${CSS.escape(armed.handle)}"]`,
    );
    handle?.setAttribute('data-armed', 'true');
    return (): void => {
      handle?.removeAttribute('data-armed');
    };
  }, [root, armed]);
}

type Send = (action: ConnectAction) => void;

interface Drag {
  readonly onConnectStart: (event: PointerLike, params: OnConnectStartParams) => void;
  readonly onConnectEnd: (event: PointerLike, state: FinalConnectionState) => void;
}

function landedOn(state: FinalConnectionState): EdgeEnd | null {
  const { toHandle } = state;
  if (toHandle?.id === undefined || toHandle.id === null) return null;
  return { nodeId: toHandle.nodeId, handle: toHandle.id };
}

function localPoint(root: RefObject<HTMLElement | null>, client: GraphPoint): GraphPoint {
  const box = root.current?.getBoundingClientRect();
  return box === undefined ? client : { x: client.x - box.left, y: client.y - box.top };
}

function useDrag(root: RefObject<HTMLElement | null>, idiom: GraphIdiom, send: Send): Drag {
  const flow = useReactFlow<GraphFlowNode, GraphFlowEdge>();
  const gesture = useRef<Gesture | null>(null);
  const onConnectStart = useStableCallback(
    (event: PointerLike, params: OnConnectStartParams): void => {
      const at = clientPointOf(event);
      const { nodeId, handleId } = params;
      gesture.current =
        at === null || nodeId === null || handleId === null
          ? null
          : { source: { nodeId, handle: handleId }, at };
    },
  );
  const onConnectEnd = useStableCallback(
    (event: PointerLike, state: FinalConnectionState): void => {
      const started = gesture.current;
      gesture.current = null;
      const end = clientPointOf(event);
      const slop = idiom === 'touch' ? TOUCH_SLOP : POINTER_SLOP;
      if (started === null || end === null || isTap(started.at, end, slop)) return;
      send(
        resolveDrop({
          source: started.source,
          point: flow.screenToFlowPosition(end),
          screen: localPoint(root, end),
          zoom: flow.getViewport().zoom,
          cards: cardsOf(flow.getNodes()),
          landed: landedOn(state),
        }),
      );
    },
  );
  return { onConnectStart, onConnectEnd };
}

interface Tap {
  readonly armed: EdgeEnd | null;
  readonly cancel: () => void;
  readonly onTapCapture: (event: ReactMouseEvent) => void;
}

function useTap(root: RefObject<HTMLElement | null>, send: Send): Tap {
  const flow = useReactFlow<GraphFlowNode, GraphFlowEdge>();
  const [armed, setArmed] = useState<EdgeEnd | null>(null);
  useArmedRing(root, armed);
  const onTapCapture = useStableCallback((event: ReactMouseEvent): void => {
    const target = event.target;
    const tap = tapTargetOf(target instanceof Element ? target : null);
    const result = reduceTap(armed, tap, {
      zoom: flow.getViewport().zoom,
      cards: cardsOf(flow.getNodes()),
    });
    if (tapConsumed(armed, tap, result)) event.stopPropagation();
    setArmed(result.armed);
    send(result.action);
  });
  const cancel = useStableCallback((): void => {
    setArmed(null);
  });
  return { armed, cancel, onTapCapture };
}

function nothing(): void {
  return undefined;
}

export function useGraphConnect(
  root: RefObject<HTMLElement | null>,
  idiom: GraphIdiom,
  emit: (intent: GraphCanvasIntent) => void,
  enabled: boolean,
): GraphConnect {
  const send = useStableCallback((action: ConnectAction): void => {
    const intent = intentOf(action);
    if (intent !== null) emit(intent);
  });
  const drag = useDrag(root, idiom, send);
  const tap = useTap(root, send);
  if (!enabled) {
    return {
      armed: null,
      cancel: nothing,
      onConnectStart: nothing,
      onConnectEnd: nothing,
      onTapCapture: nothing,
      onPaneClick: nothing,
    };
  }
  return { ...drag, ...tap, onPaneClick: tap.cancel };
}
