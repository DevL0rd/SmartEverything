import {
  ApiError,
  type AiChatChange,
  type AiChatRow,
  type AiSubagent,
} from '@smarteverything/domain';
import type { Store } from '../../store/store';
import type { ToolHub } from '../../ai-tools/tool-hub';
import { scopedHub } from './scoped-tools';
export function childTools(parent: AiChatRow, body: AiSubagent, hub: ToolHub | null): string[] {
  const allowed =
    scopedHub(hub, parent.tools)
      ?.list()
      .map((tool) => tool.name) ?? [];
  const child = body.tools ?? allowed;
  if (child.some((name) => !allowed.includes(name)))
    throw new ApiError('forbidden', 'A child cannot widen its parent tool grant.');
  assertChildEngine(parent, body);
  return [...new Set(child)];
}
function assertChildEngine(parent: AiChatRow, body: AiSubagent): void {
  if (
    body.engine !== undefined &&
    (body.engine.kind !== parent.engine.kind ||
      JSON.stringify(independent(body.engine)) !==
        JSON.stringify(
          independent({ ...parent.engine, model: body.engine.model, effort: body.engine.effort }),
        ))
  )
    throw new ApiError(
      'forbidden',
      'A child must preserve its native parent computer, runtime and access options.',
    );
}
export function assertChildChange(store: Store, chat: AiChatRow, change: AiChatChange): void {
  if (chat.kind !== 'subagent' || chat.parent_id === null) return;
  const parent = store.aiChats.chat(chat.parent_id);
  assertToolChange(chat, change);
  assertNativeChange(parent, change);
}
export function effectiveTools(store: Store, chat: AiChatRow): readonly string[] | null {
  let allowed: readonly string[] | null = chat.tools;
  let cursor = chat;
  while (cursor.kind === 'subagent' && cursor.parent_id !== null) {
    cursor = store.aiChats.chat(cursor.parent_id);
    if (cursor.tools !== null) {
      const parentTools = cursor.tools;
      allowed =
        allowed === null ? parentTools : allowed.filter((tool) => parentTools.includes(tool));
    }
  }
  return allowed;
}

function assertToolChange(chat: AiChatRow, change: AiChatChange): void {
  if (
    change.tools !== undefined &&
    change.tools !== null &&
    chat.tools !== null &&
    change.tools.some((tool) => chat.tools?.includes(tool) !== true)
  )
    throw new ApiError('forbidden', 'A child tool grant cannot be widened after launch.');
  if (change.tools === null && chat.tools !== null)
    throw new ApiError('forbidden', 'A child cannot replace its frozen grant with all tools.');
}

function assertNativeChange(parent: AiChatRow, change: AiChatChange): void {
  if (
    change.engine !== undefined &&
    JSON.stringify(
      independent({
        ...parent.engine,
        model: change.engine.model,
        effort: change.engine.effort,
      }),
    ) !== JSON.stringify(independent(change.engine))
  )
    throw new ApiError('forbidden', 'A child cannot widen its inherited native scope.');
}

function independent(engine: {
  readonly kind: string;
  readonly session_id?: string | null;
  readonly model: string | null;
  readonly effort: string | null;
}): unknown {
  return engine.kind === 'dsh' ? { ...engine, session_id: null } : engine;
}
