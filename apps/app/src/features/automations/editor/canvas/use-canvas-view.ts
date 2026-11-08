import { useEffect, useRef, type RefObject } from 'react';
import { useReactFlow, useStoreApi } from '@xyflow/react';
import { background } from '@smarteverything/logging';
import { useStableCallback } from '../../../../design/use-stable-callback';
import { levelForZoom } from '../../model/canvas/lod';
import type { GraphFlowEdge, GraphFlowNode } from './graph-canvas-types';
import {
  FIT_OPTIONS,
  FOCUS_MAX_ZOOM,
  FIT_PADDING,
  FOCUS_MIN_ZOOM,
  ZOOM_LIMITS,
  commandKey,
  fitViewport,
  wholeViewport,
  portsAreTargets,
  type GraphFraming,
  type ViewportCommand,
} from './viewport';

function useFlowApi(): ReturnType<typeof useReactFlow<GraphFlowNode, GraphFlowEdge>> {
  return useReactFlow<GraphFlowNode, GraphFlowEdge>();
}

export function useFitGraph(framing: GraphFraming): () => Promise<boolean> {
  const flow = useFlowApi();
  const store = useStoreApi();
  return useStableCallback((): Promise<boolean> => {
    const nodes = flow.getNodes();
    if (nodes.length === 0) return Promise.resolve(false);
    const start = nodes.find((node) => node.type === 'start');
    const { width, height, setMinZoom } = store.getState();
    const graph = flow.getNodesBounds(nodes);
    const view =
      framing === 'whole'
        ? wholeViewport(graph, { width, height })
        : fitViewport(
            graph,
            start === undefined ? null : flow.getNodesBounds([start]),
            { width, height },
            FIT_PADDING,
          );
    setMinZoom(Math.min(ZOOM_LIMITS.min, view.zoom));
    return flow.setViewport(view);
  });
}

export function useViewportCommand(
  command: ViewportCommand | null,
  fit: () => Promise<boolean>,
): void {
  const flow = useFlowApi();
  const key = commandKey(command);
  const handled = useRef('');
  useEffect(() => {
    if (command === null || handled.current === key) return;
    handled.current = key;
    const actions = {
      fit: (): void => {
        background(fit(), 'automations.canvas.fit');
      },
      fitSelection: (): void => {
        const nodes = flow.getNodes().filter((node) => node.selected === true);
        background(flow.fitView({ ...FIT_OPTIONS, nodes }), 'automations.canvas.fit');
      },
      zoomIn: (): void => {
        background(flow.zoomIn(), 'automations.canvas.zoom');
      },
      zoomOut: (): void => {
        background(flow.zoomOut(), 'automations.canvas.zoom');
      },
    } satisfies Record<ViewportCommand['type'], () => void>;
    actions[command.type]();
  }, [command, key, flow, fit]);
}

export function useFocusNode(id: string | null): void {
  const flow = useFlowApi();
  useEffect(() => {
    if (id === null) return;
    background(
      flow.fitView({
        ...FIT_OPTIONS,
        nodes: [{ id }],
        maxZoom: FOCUS_MAX_ZOOM,
        minZoom: FOCUS_MIN_ZOOM,
      }),
      'automations.canvas.focus',
    );
  }, [id, flow]);
}

function applyZoom(element: HTMLElement, zoom: number, idiom: 'touch' | 'pointer'): void {
  element.style.setProperty('--se-zoom', String(zoom));
  element.setAttribute('data-lod', levelForZoom(zoom));
  element.setAttribute('data-ports', portsAreTargets(zoom, idiom) ? 'on' : 'off');
}

export function useZoomAttributes(
  root: RefObject<HTMLDivElement | null>,
  idiom: 'touch' | 'pointer',
): void {
  const store = useStoreApi();
  useEffect(() => {
    const element = root.current;
    if (element === null) return undefined;
    let last = store.getState().transform[2];
    applyZoom(element, last, idiom);
    return store.subscribe((state) => {
      const zoom = state.transform[2];
      if (zoom === last) return;
      last = zoom;
      applyZoom(element, zoom, idiom);
    });
  }, [store, root, idiom]);
}
