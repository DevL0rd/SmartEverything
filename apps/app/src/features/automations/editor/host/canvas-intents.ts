import { z } from 'zod';
import {
  SHORTCUT_NAMES,
  type GraphIntentFeedback,
  type GraphMeasuredSize,
  type ShortcutName,
} from '../canvas/graph-canvas-types';
import { nextPathName, addPathOps } from '../inspector/sections/graph-paths-model';
import { applyGraphIntent, type GraphIntent } from './apply-intents';
import { CONNECT_REQUEST, EDGE_END_REQUEST } from './connect-intent';
import { DELETE_REQUEST } from './delete-intent';
import { DISCONNECT_REQUEST } from './disconnect-intent';
import type { HostActions } from './host-actions';
import { selectIds, type EditorEnv, type IntentOutcome } from './intent-env';
import { MOVE_REQUEST } from './move-intent';

const POINT = z.strictObject({ x: z.number(), y: z.number() });
const NODE = z.strictObject({ nodeId: z.string().min(1) });

export const CANVAS_INTENT = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('select'), ids: z.array(z.string().min(1)) }),
  z.strictObject({
    type: z.literal('ready'),
    metrics: z.strictObject({ width: z.number(), height: z.number() }),
  }),
  z.strictObject({
    type: z.literal('measured'),
    sizes: z.array(
      z.strictObject({ id: z.string().min(1), w: z.number().positive(), h: z.number().positive() }),
    ),
  }),
  z.strictObject({ type: z.literal('addPath'), ...NODE.shape }),
  z.strictObject({
    type: z.literal('stepPass'),
    ...NODE.shape,
    delta: z.union([z.literal(-1), z.literal(1)]),
  }),
  z.strictObject({ type: z.literal('connect'), request: CONNECT_REQUEST }),
  z.strictObject({ type: z.literal('disconnect'), request: DISCONNECT_REQUEST }),
  z.strictObject({ type: z.literal('delete'), request: DELETE_REQUEST }),
  z.strictObject({ type: z.literal('move'), request: MOVE_REQUEST }),
  z.strictObject({
    type: z.literal('dropEmpty'),
    from: EDGE_END_REQUEST,
    point: POINT,
    screen: POINT,
  }),
  z.strictObject({ type: z.literal('insertOnWire'), from: EDGE_END_REQUEST }),
  z.strictObject({ type: z.literal('addTrigger') }),
  z.strictObject({ type: z.literal('open'), ...NODE.shape }),
  z.strictObject({ type: z.literal('shortcut'), name: z.enum(SHORTCUT_NAMES) }),
  z.strictObject({ type: z.literal('viewportSettled') }),
  z.strictObject({ type: z.literal('escape') }),
]);

export type CanvasIntent = z.infer<typeof CANVAS_INTENT>;

export class InvalidCanvasIntentError extends Error {
  override readonly name = 'InvalidCanvasIntentError';

  constructor(readonly issues: readonly string[]) {
    super(`The canvas sent an intent outside its contract: ${issues.join('; ')}.`);
  }
}

export function parseCanvasIntent(raw: unknown): CanvasIntent {
  const parsed = CANVAS_INTENT.safeParse(raw);
  if (parsed.success) return parsed.data;
  throw new InvalidCanvasIntentError(
    parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
  );
}

export type MeasureSizes = (sizes: readonly GraphMeasuredSize[]) => void;

export interface CanvasEnv {
  readonly intent: EditorEnv;
  readonly actions: HostActions;
  readonly measure: MeasureSizes;
}

export function feedbackOf(outcome: IntentOutcome): GraphIntentFeedback {
  return outcome.ok
    ? { announcement: outcome.announcement, toast: outcome.toast ?? null, failed: false }
    : { announcement: outcome.announcement, toast: outcome.toast, failed: true };
}

async function edit(intent: GraphIntent, env: CanvasEnv): Promise<GraphIntentFeedback> {
  return feedbackOf(await applyGraphIntent(intent, env.intent));
}

function addPath(nodeId: string, env: CanvasEnv): GraphIntentFeedback | null {
  const { store } = env.intent;
  const node = store.state.get().program.nodes.find((item) => item.id === nodeId);
  if (node === undefined) return null;
  const name = nextPathName((node.paths ?? []).map((path) => path.name));
  const result = store.apply(addPathOps(node.key, name));
  return result.ok
    ? { announcement: `Added ${name}.`, toast: null, failed: false }
    : { announcement: result.reason, toast: result.reason, failed: true };
}

const CLIPBOARD_SHORTCUTS: Readonly<Record<string, GraphIntent>> = {
  copy: { type: 'copy' },
  cut: { type: 'cut' },
  paste: { type: 'paste' },
  duplicate: { type: 'duplicate' },
};

async function shortcut(name: ShortcutName, env: CanvasEnv): Promise<GraphIntentFeedback | null> {
  const { store } = env.intent;
  const clipboard = CLIPBOARD_SHORTCUTS[name];
  if (clipboard !== undefined) return edit(clipboard, env);
  if (name === 'undo') store.undo();
  else if (name === 'redo') store.redo();
  else if (name === 'selectAll') store.selectEverything();
  else env.actions.groupSelection(store.state.get().selection.ids);
  return null;
}

type EditIntent = Extract<CanvasIntent, { type: 'connect' | 'disconnect' | 'delete' | 'move' }>;

type InteractIntent = Exclude<CanvasIntent, EditIntent | { type: 'shortcut' }>;

type StateIntent = Extract<
  InteractIntent,
  { type: 'select' | 'escape' | 'measured' | 'ready' | 'viewportSettled' }
>;

const STATE_TYPES: ReadonlySet<string> = new Set([
  'select',
  'escape',
  'measured',
  'ready',
  'viewportSettled',
]);

function isState(intent: InteractIntent): intent is StateIntent {
  return STATE_TYPES.has(intent.type);
}

function noteState(intent: StateIntent, env: CanvasEnv): null {
  if (intent.type === 'select') selectIds(env.intent.store, intent.ids);
  else if (intent.type === 'escape') {
    env.intent.store.clearSelected();
    env.actions.escape();
  } else if (intent.type === 'measured') env.measure(intent.sizes);
  return null;
}

function interact(intent: InteractIntent, env: CanvasEnv): GraphIntentFeedback | null {
  if (isState(intent)) return noteState(intent, env);
  switch (intent.type) {
    case 'open':
      env.actions.openNode(intent.nodeId);
      return null;
    case 'addPath':
      return addPath(intent.nodeId, env);
    case 'stepPass':
      env.actions.stepPass(intent.nodeId, intent.delta);
      return null;
    case 'dropEmpty':
      env.actions.dropEmpty(intent.from, intent.point, intent.screen);
      return null;
    case 'insertOnWire':
      env.actions.insertOnWire(intent.from);
      return null;
    case 'addTrigger':
      env.actions.addTrigger();
      return null;
  }
}

const EDIT_TYPES: ReadonlySet<string> = new Set(['connect', 'disconnect', 'delete', 'move']);

function isEdit(intent: CanvasIntent): intent is EditIntent {
  return EDIT_TYPES.has(intent.type);
}

export async function applyCanvasIntent(
  raw: unknown,
  env: CanvasEnv,
): Promise<GraphIntentFeedback | null> {
  const intent = parseCanvasIntent(raw);
  if (intent.type === 'shortcut') return shortcut(intent.name, env);
  return isEdit(intent) ? edit(intent, env) : interact(intent, env);
}

export interface ViewActions {
  readonly openNode: (id: string) => void;
  readonly stepPass: (nodeId: string, delta: -1 | 1) => void;
  readonly settled: () => void;
}

export interface ViewEnv {
  readonly store: EditorEnv['store'];
  readonly actions: ViewActions;
  readonly measure: MeasureSizes;
}

export function applyViewIntent(raw: unknown, env: ViewEnv): GraphIntentFeedback | null {
  const intent = parseCanvasIntent(raw);
  if (intent.type === 'select') selectIds(env.store, intent.ids);
  else if (intent.type === 'open') env.actions.openNode(intent.nodeId);
  else if (intent.type === 'stepPass') env.actions.stepPass(intent.nodeId, intent.delta);
  else if (intent.type === 'viewportSettled') env.actions.settled();
  else if (intent.type === 'measured') env.measure(intent.sizes);
  return null;
}
