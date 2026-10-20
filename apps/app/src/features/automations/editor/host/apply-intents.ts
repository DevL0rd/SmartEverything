import { CANVAS_INTENT, type CanvasIntent } from '../../model/canvas/contract';
import { connectNodes } from './connect-intent';
import { deleteIds, runShortcut, selectIds } from './edit-intents';
import { InvalidCanvasIntentError, type IntentEnv } from './intent-env';
import { moveNodes } from './move-intent';

const EDIT_TYPES = ['select', 'connect', 'move', 'delete', 'shortcut'] as const;

type EditIntent = Extract<CanvasIntent, { type: (typeof EDIT_TYPES)[number] }>;

type ViewIntent = Exclude<CanvasIntent, EditIntent>;

function isEdit(intent: CanvasIntent): intent is EditIntent {
  return EDIT_TYPES.some((type) => type === intent.type);
}

export function parseIntent(raw: unknown): CanvasIntent {
  const parsed = CANVAS_INTENT.safeParse(raw);
  if (parsed.success) return parsed.data;
  throw new InvalidCanvasIntentError(
    parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
  );
}

function routeView(intent: ViewIntent, env: IntentEnv): void {
  switch (intent.type) {
    case 'openNode':
      env.actions.openNode(intent.id);
      return;
    case 'insertOnEdge':
      env.actions.insertOnEdge(intent.edgeId);
      return;
    case 'openSlot':
      env.actions.openSlot(intent.slotId);
      return;
    case 'portDropEmpty':
      env.actions.portDropEmpty(intent.from, intent.point);
      return;
    case 'viewportSettled':
      env.actions.viewportSettled(intent.viewport);
      return;
    case 'ready':
      env.ready(intent.metrics);
      return;
  }
}

async function applyEdit(intent: EditIntent, env: IntentEnv): Promise<void> {
  switch (intent.type) {
    case 'select':
      selectIds(env.store, intent.ids);
      return;
    case 'connect':
      connectNodes(env, intent.connection);
      return;
    case 'move':
      moveNodes(env, intent.patches);
      return;
    case 'delete':
      deleteIds(env.store, intent.ids);
      return;
    case 'shortcut':
      await runShortcut(intent.name, env);
      return;
  }
}

export async function applyIntent(intent: CanvasIntent, env: IntentEnv): Promise<void> {
  if (isEdit(intent)) await applyEdit(intent, env);
  else routeView(intent, env);
}
