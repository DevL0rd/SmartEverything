import type { GraphScene, GraphSceneEdge } from '../../../model/graph/scene-contract';
import type { GraphCanvasIntent } from '../graph-canvas-types';
import { followBackward, followForward, siblingOf, tabNeighbour, type Step } from './graph-nav';
import { panKeyOf, shortcutOf, viewKeyOf, type PanKey, type ViewKey } from './shortcut-keys';

export const NUDGE_STEP = 8;

export interface KeyLike {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}

export interface KeyContext {
  readonly scene: GraphScene;
  readonly focused: string | null;
  readonly selection: readonly string[];
  readonly wires: readonly string[];
  readonly armed: boolean;
}

export type KeyCommand =
  | { readonly type: 'focus'; readonly id: string }
  | { readonly type: 'emit'; readonly intents: readonly GraphCanvasIntent[] }
  | { readonly type: 'view'; readonly key: ViewKey }
  | { readonly type: 'pan'; readonly key: PanKey }
  | { readonly type: 'disarm' };

const ARROWS: Readonly<Record<string, { readonly dx: number; readonly dy: number }>> = {
  ArrowLeft: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
  ArrowUp: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 },
};

function arrowOf(key: string): { readonly dx: number; readonly dy: number } | undefined {
  return ARROWS[key];
}

function emit(...intents: readonly GraphCanvasIntent[]): KeyCommand {
  return { type: 'emit', intents };
}

function focusOn(id: string | null): KeyCommand | null {
  return id === null ? null : { type: 'focus', id };
}

function navigate(key: string, scene: GraphScene, focused: string): KeyCommand | null {
  switch (key) {
    case 'ArrowRight':
      return focusOn(followForward(scene, focused));
    case 'ArrowLeft':
      return focusOn(followBackward(scene, focused));
    case 'ArrowUp':
      return focusOn(siblingOf(scene, focused, -1));
    default:
      return focusOn(siblingOf(scene, focused, 1));
  }
}

function nudge(event: KeyLike, context: KeyContext): KeyCommand | null {
  const arrow = arrowOf(event.key);
  const { focused, selection } = context;
  const ids =
    focused !== null && !selection.includes(focused)
      ? [focused]
      : selection.length > 0
        ? selection
        : [];
  if (arrow === undefined || ids.length === 0) return null;
  return emit({
    type: 'move',
    request: { kind: 'nudge', ids, dx: arrow.dx * NUDGE_STEP, dy: arrow.dy * NUDGE_STEP },
  });
}

function removal(context: KeyContext): KeyCommand | null {
  const edges: readonly GraphSceneEdge[] = context.scene.edges.filter((edge) =>
    context.wires.includes(edge.id),
  );
  if (edges.length > 0) {
    return emit(
      ...edges.map((edge): GraphCanvasIntent => ({
        type: 'disconnect',
        request:
          edge.kind === 'exec'
            ? { kind: 'exec', from: edge.source }
            : { kind: 'value', target: edge.target },
      })),
    );
  }
  return context.selection.length === 0
    ? null
    : emit({ type: 'delete', request: { ids: context.selection } });
}

function tab(event: KeyLike, context: KeyContext): KeyCommand | null {
  if (context.focused === null) return null;
  const step: Step = event.shiftKey ? -1 : 1;
  return focusOn(tabNeighbour(context.scene, context.focused, step));
}

function escape(context: KeyContext): KeyCommand {
  return context.armed ? { type: 'disarm' } : emit({ type: 'escape' });
}

type Handler = (event: KeyLike, context: KeyContext) => KeyCommand | null;

function onFocused(make: (focused: string) => KeyCommand): Handler {
  return (_event, context) => (context.focused === null ? null : make(context.focused));
}

const BY_KEY: Readonly<Record<string, Handler>> = {
  Escape: (_event, context) => escape(context),
  Tab: tab,
  Delete: (_event, context) => removal(context),
  Backspace: (_event, context) => removal(context),
  Enter: onFocused((focused) => emit({ type: 'open', nodeId: focused })),
  ' ': onFocused((focused) => emit({ type: 'select', ids: [focused] })),
};

function arrow(event: KeyLike, context: KeyContext): KeyCommand | null {
  if (event.altKey) return nudge(event, context);
  if (event.shiftKey) return null;
  if (context.focused === null) {
    const pan = panKeyOf(event);
    return pan === null ? null : { type: 'pan', key: pan };
  }
  return navigate(event.key, context.scene, context.focused);
}

function viewport(event: KeyLike): KeyCommand | null {
  const key = viewKeyOf(event);
  return key === null ? null : { type: 'view', key };
}

export function commandFor(event: KeyLike, context: KeyContext): KeyCommand | null {
  const shortcut = shortcutOf(event);
  if (shortcut !== null) return emit({ type: 'shortcut', name: shortcut });
  if (event.ctrlKey || event.metaKey) return null;
  const handler = BY_KEY[event.key];
  if (handler !== undefined) return handler(event, context);
  if (arrowOf(event.key) !== undefined) return arrow(event, context);
  return viewport(event);
}
