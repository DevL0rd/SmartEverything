import { useEffect, useRef, type RefObject } from 'react';
import { useNodesInitialized, useReactFlow } from '@xyflow/react';
import { background } from '@smarteverything/logging';
import { useStableCallback } from '../../../../design/use-stable-callback';
import type {
  GraphCanvasIntent,
  GraphCanvasProps,
  GraphFlowEdge,
  GraphFlowNode,
} from './graph-canvas-types';
import { useFitGraph } from './use-canvas-view';
import { openingViewport } from './viewport';

const PASSIVE: ReadonlySet<GraphCanvasIntent['type']> = new Set([
  'measured',
  'ready',
  'viewportSettled',
]);

type HeldView = 'opening' | 'fit' | null;

export interface OpeningView {
  readonly onMoveStart: (event: MouseEvent | TouchEvent | null) => void;
  readonly touched: (intent: GraphCanvasIntent) => void;
  readonly fit: () => Promise<boolean>;
}

export type OpeningInput = Pick<GraphCanvasProps, 'scene' | 'idiom' | 'focusNode' | 'framing'>;

function useHeldResize(root: RefObject<HTMLElement | null>, apply: () => void): void {
  useEffect(() => {
    const element = root.current;
    if (element === null) return undefined;
    const observer = new ResizeObserver(apply);
    observer.observe(element);
    return (): void => {
      observer.disconnect();
    };
  }, [root, apply]);
}

export function useOpeningView(
  root: RefObject<HTMLElement | null>,
  input: OpeningInput,
): OpeningView {
  const { scene, idiom, framing } = input;
  const focused = input.focusNode !== null;
  const flow = useReactFlow<GraphFlowNode, GraphFlowEdge>();
  const initialised = useNodesInitialized();
  const fitGraph = useFitGraph(framing);
  const held = useRef<HeldView>(framing === 'whole' ? 'fit' : 'opening');
  const apply = useStableCallback((): void => {
    const element = root.current;
    if (!initialised || focused || held.current === null || element === null) return;
    const { width, height } = element.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;
    if (held.current === 'fit') {
      background(fitGraph(), 'automations.canvas.fit');
      return;
    }
    background(
      flow.setViewport(openingViewport(scene, { width, height }, idiom)),
      'automations.canvas.open',
    );
  });
  useEffect(() => {
    apply();
  }, [apply, initialised, focused, scene, idiom]);
  useHeldResize(root, apply);
  const onMoveStart = useStableCallback((event: MouseEvent | TouchEvent | null): void => {
    if (event !== null) held.current = null;
  });
  const touched = useStableCallback((intent: GraphCanvasIntent): void => {
    if (!PASSIVE.has(intent.type)) held.current = null;
  });
  const fit = useStableCallback((): Promise<boolean> => {
    held.current = 'fit';
    return fitGraph();
  });
  return { onMoveStart, touched, fit };
}
