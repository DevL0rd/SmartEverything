import { useEffect } from 'react';
import { useReactFlow } from '@xyflow/react';
import { background } from '@smarteverything/logging';
import type { CanvasIntent, Scene } from '../../model/canvas/contract';
import { useStableCallback } from '../../../../design/use-stable-callback';
import type { CanvasEdge, CanvasNode } from './canvas-types';
import { neighbourOf } from './key-navigation';
import {
  isDeleteKey,
  isEditableTarget,
  isOpenKey,
  panKeyFor,
  shortcutFor,
  viewportKeyFor,
  type PanKey,
  type ViewportKey,
} from './shortcuts';
import { FIT_OPTIONS, KEY_PAN_STEP } from './viewport';

type Flow = ReturnType<typeof useReactFlow<CanvasNode, CanvasEdge>>;

const PAN_DELTA: Readonly<Record<PanKey, { readonly x: number; readonly y: number }>> = {
  left: { x: KEY_PAN_STEP, y: 0 },
  right: { x: -KEY_PAN_STEP, y: 0 },
  up: { x: 0, y: KEY_PAN_STEP },
  down: { x: 0, y: -KEY_PAN_STEP },
};

const DELETABLE: ReadonlySet<string> = new Set(['trigger', 'step', 'container', 'value']);

function focusedNodeId(target: EventTarget | null): string | null {
  if (!(target instanceof HTMLElement)) return null;
  return target.closest<HTMLElement>('.react-flow__node')?.dataset['id'] ?? null;
}

function runViewportKey(flow: Flow, key: ViewportKey): void {
  const selected = flow.getNodes().filter((node) => node.selected === true);
  const actions: Record<ViewportKey, () => Promise<boolean>> = {
    zoomIn: (): Promise<boolean> => flow.zoomIn(),
    zoomOut: (): Promise<boolean> => flow.zoomOut(),
    reset: (): Promise<boolean> => flow.zoomTo(1),
    fit: (): Promise<boolean> => flow.fitView(FIT_OPTIONS),
    fitSelection: (): Promise<boolean> => flow.fitView({ ...FIT_OPTIONS, nodes: selected }),
  };
  background(actions[key](), 'automations.canvas.key');
}

function moveFocus(scene: Scene, from: string, key: PanKey): void {
  const next = neighbourOf(scene, from, key);
  if (next === null) return;
  document.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(next)}"]`)?.focus();
}

function panBy(flow: Flow, key: PanKey): void {
  const { x, y, zoom } = flow.getViewport();
  const delta = PAN_DELTA[key];
  background(flow.setViewport({ x: x + delta.x, y: y + delta.y, zoom }), 'automations.canvas.key');
}

interface KeyContext {
  readonly flow: Flow;
  readonly scene: Scene;
  readonly emit: (intent: CanvasIntent) => void;
}

function deletableIds(flow: Flow): string[] {
  return flow
    .getNodes()
    .filter((node) => node.selected === true && DELETABLE.has(node.data.scene.role))
    .map((node) => node.id);
}

function handleKey(event: KeyboardEvent, { flow, scene, emit }: KeyContext): void {
  if (isEditableTarget(event.target)) return;
  const shortcut = shortcutFor(event);
  if (shortcut !== null) {
    event.preventDefault();
    emit({ type: 'shortcut', name: shortcut });
    return;
  }
  const view = viewportKeyFor(event);
  if (view !== null) {
    event.preventDefault();
    runViewportKey(flow, view);
    return;
  }
  const focused = focusedNodeId(event.target);
  const pan = panKeyFor(event);
  if (pan !== null) {
    event.preventDefault();
    event.stopPropagation();
    if (focused === null) panBy(flow, pan);
    else moveFocus(scene, focused, pan);
    return;
  }
  if (isOpenKey(event) && focused !== null) {
    emit({ type: 'openNode', id: focused });
    return;
  }
  const ids = isDeleteKey(event) ? deletableIds(flow) : [];
  if (ids.length > 0) emit({ type: 'delete', ids });
}

export function useCanvasKeys(
  send: (intent: CanvasIntent) => Promise<void>,
  active: boolean,
  scene: Scene,
): void {
  const flow = useReactFlow<CanvasNode, CanvasEdge>();
  const emit = useStableCallback((intent: CanvasIntent): void => {
    background(send(intent), 'automations.canvas.intent', { intent: intent.type });
  });
  const onKeyDown = useStableCallback((event: KeyboardEvent): void => {
    handleKey(event, { flow, scene, emit });
  });
  useEffect(() => {
    if (!active) return undefined;
    document.addEventListener('keydown', onKeyDown, true);
    return (): void => {
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [active, onKeyDown]);
}
