import { useReactFlow } from '@xyflow/react';
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react';
import { background } from '@smarteverything/logging';
import type { GraphScene } from '../../../model/graph/scene-contract';
import { useStableCallback } from '../../../../../design/use-stable-callback';
import type { GraphCanvasIntent, GraphFlowEdge, GraphFlowNode } from '../graph-canvas-types';
import { commandFor, type KeyCommand } from './graph-keys';
import type { PanKey } from './shortcut-keys';
import { useRevealNode } from '../use-reveal';
import { FIT_OPTIONS } from '../viewport';

export interface GraphKeyInput {
  readonly root: RefObject<HTMLElement | null>;
  readonly scene: GraphScene;
  readonly selection: readonly string[];
  readonly wires: readonly string[];
  readonly armed: boolean;
  readonly emit: (intent: GraphCanvasIntent) => void;
  readonly disarm: () => void;
  readonly fit: () => Promise<boolean>;
}

const EDITABLE = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

const PAN_STEP = 80;

const PAN_DELTA: Readonly<Record<PanKey, { readonly x: number; readonly y: number }>> = {
  left: { x: PAN_STEP, y: 0 },
  right: { x: -PAN_STEP, y: 0 },
  up: { x: 0, y: PAN_STEP },
  down: { x: 0, y: -PAN_STEP },
};

function focusedNode(target: EventTarget): string | null {
  if (!(target instanceof Element)) return null;
  return target.closest('.react-flow__node')?.getAttribute('data-id') ?? null;
}

function isEditable(target: EventTarget): boolean {
  return (
    target instanceof HTMLElement && (target.isContentEditable || EDITABLE.has(target.tagName))
  );
}

function useViewCommands(fit: () => Promise<boolean>): (command: KeyCommand) => void {
  const flow = useReactFlow<GraphFlowNode, GraphFlowEdge>();
  return useStableCallback((command: KeyCommand): void => {
    if (command.type === 'pan') {
      const { x, y, zoom } = flow.getViewport();
      const delta = PAN_DELTA[command.key];
      background(
        flow.setViewport({ x: x + delta.x, y: y + delta.y, zoom }),
        'automations.canvas.key',
      );
    }
    if (command.type !== 'view') return;
    const selected = flow.getNodes().filter((node) => node.selected === true);
    const actions = {
      zoomIn: (): Promise<boolean> => flow.zoomIn(),
      zoomOut: (): Promise<boolean> => flow.zoomOut(),
      reset: (): Promise<boolean> => flow.zoomTo(1),
      fit,
      fitSelection: (): Promise<boolean> => flow.fitView({ ...FIT_OPTIONS, nodes: selected }),
    };
    background(actions[command.key](), 'automations.canvas.key');
  });
}

export function useGraphKeys(input: GraphKeyInput): (event: ReactKeyboardEvent) => void {
  const reveal = useRevealNode(input.root);
  const view = useViewCommands(input.fit);
  const run = useStableCallback((command: KeyCommand): void => {
    if (command.type === 'disarm') input.disarm();
    if (command.type === 'emit') command.intents.forEach(input.emit);
    view(command);
    if (command.type !== 'focus') return;
    input.root.current
      ?.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(command.id)}"]`)
      ?.focus({ preventScroll: true });
    reveal(command.id);
  });
  return useStableCallback((event: ReactKeyboardEvent): void => {
    if (isEditable(event.target)) return;
    const command = commandFor(event, {
      scene: input.scene,
      focused: focusedNode(event.target),
      selection: input.selection,
      wires: input.wires,
      armed: input.armed,
    });
    if (command === null) return;
    event.preventDefault();
    event.stopPropagation();
    run(command);
  });
}
