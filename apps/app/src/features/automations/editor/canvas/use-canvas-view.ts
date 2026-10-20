import { useEffect, useRef, type RefObject } from 'react';
import { useReactFlow, useStoreApi } from '@xyflow/react';
import { background } from '@smarteverything/logging';
import type { CanvasIntent, Scene, ViewportCommand } from '../../model/canvas/contract';
import { levelForZoom } from '../../model/canvas/lod';
import { useStableCallback } from '../../../../design/use-stable-callback';
import { loadCanvasFonts } from './canvas-fonts';
import type { CanvasEdge, CanvasNode } from './canvas-types';
import {
  FIT_OPTIONS,
  FOCUS_MAX_ZOOM,
  commandKey,
  openingViewport,
  portsAreTargets,
  sizeClassFor,
  type SizeClass,
} from './viewport';

function useFlowApi(): ReturnType<typeof useReactFlow<CanvasNode, CanvasEdge>> {
  return useReactFlow<CanvasNode, CanvasEdge>();
}

export function useViewportCommand(command: ViewportCommand | null): void {
  const flow = useFlowApi();
  const key = commandKey(command);
  const handled = useRef('');
  useEffect(() => {
    if (command === null || handled.current === key) return;
    handled.current = key;
    const actions = {
      fit: (): void => {
        background(flow.fitView(FIT_OPTIONS), 'automations.canvas.fit');
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
  }, [command, key, flow]);
}

export function useFocusNode(id: string | null): void {
  const flow = useFlowApi();
  useEffect(() => {
    if (id === null) return;
    background(
      flow.fitView({ ...FIT_OPTIONS, nodes: [{ id }], maxZoom: FOCUS_MAX_ZOOM }),
      'automations.canvas.focus',
    );
  }, [id, flow]);
}

export function useOpeningViewport(scene: Scene, focusNode: string | null): void {
  const flow = useFlowApi();
  const { mode } = scene;
  const latest = useStableCallback(() => scene);
  const focused = useStableCallback(() => focusNode);
  useEffect(() => {
    if (focused() !== null) return;
    background(flow.setViewport(openingViewport(latest())), 'automations.canvas.opening');
  }, [mode, flow, latest, focused]);
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

export function useReady(
  root: RefObject<HTMLDivElement | null>,
  send: (intent: CanvasIntent) => Promise<void>,
): void {
  const emit = useStableCallback(send);
  useEffect(() => {
    const element = root.current;
    if (element === null) return undefined;
    let fontsReady = false;
    let reported: SizeClass | null = null;
    const report = (): void => {
      const { width, height } = element.getBoundingClientRect();
      if (!fontsReady || width <= 0 || height <= 0) return;
      const sizeClass = sizeClassFor(width);
      if (sizeClass === reported) return;
      reported = sizeClass;
      background(emit({ type: 'ready', metrics: { width, height } }), 'automations.canvas.ready');
    };
    const observer = new ResizeObserver(report);
    observer.observe(element);
    background(
      loadCanvasFonts().then(() => {
        fontsReady = true;
        report();
      }),
      'automations.canvas.fonts',
    );
    return (): void => {
      observer.disconnect();
    };
  }, [root, emit]);
}
