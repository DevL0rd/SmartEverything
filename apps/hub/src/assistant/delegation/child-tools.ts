import {
  ApiError,
  type AiChatChange,
  type AiChatRow,
  type AiSubagent,
  type EngineRequest,
} from '@smarteverything/domain';
import type { Store } from '../../store/store';
import type { ToolHub } from '../../ai-tools/tool-hub';
import { effectiveTools, scopedHub } from '../tool-scope';

export function childTools(
  store: Store,
  parent: AiChatRow,
  body: AiSubagent,
  hub: ToolHub | null,
): string[] {
  const inherited = effectiveTools(store, parent);
  const allowed =
    scopedHub(hub, inherited === null ? null : [...inherited])
      ?.list()
      .map((tool) => tool.name) ?? [];
  const child = body.tools ?? allowed;
  if (child.some((name) => !allowed.includes(name)))
    throw new ApiError('forbidden', 'A child cannot widen its parent tool grant.');
  assertChildEngine(parent, body);
  return [...new Set(child)];
}

export function assertChildChange(store: Store, chat: AiChatRow, change: AiChatChange): void {
  if (chat.kind !== 'subagent' || chat.parent_id === null) return;
  const parent = store.aiChats.chat(chat.parent_id);
  assertToolChange(chat, change);
  const binding = parent.engine.kind === 'dsh' && chat.engine.kind !== 'dsh' ? chat : parent;
  assertNativeChange(binding, change);
}

export function selectedHelper(
  store: Store,
  parent: AiChatRow,
  engine: EngineRequest | undefined,
): EngineRequest | undefined {
  if (parent.engine.kind !== 'dsh' || engine === undefined || engine.kind === 'dsh') return engine;
  const settings = store.computerRuntimes.settings({
    device_id: engine.device_id,
    runtime: engine.kind,
  });
  if (engine.kind === 'claude' && settings.runtime === 'claude')
    return { ...engine, settings: settings.settings.provider.options };
  if (engine.kind === 'codex' && settings.runtime === 'codex')
    return { ...engine, settings: settings.settings.provider.options };
  throw new ApiError('conflict', 'The selected computer reported a different helper runtime.');
}

function assertChildEngine(parent: AiChatRow, body: AiSubagent): void {
  if (body.engine === undefined || (parent.engine.kind === 'dsh' && body.engine.kind !== 'dsh'))
    return;
  const inherited = { ...parent.engine, model: body.engine.model, effort: body.engine.effort };
  if (body.engine.kind !== parent.engine.kind || !sameScope(body.engine, inherited))
    throw new ApiError(
      'forbidden',
      'A child must preserve its native parent computer, runtime and access options.',
    );
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
  if (change.engine === undefined) return;
  const inherited = { ...parent.engine, model: change.engine.model, effort: change.engine.effort };
  if (!sameScope(change.engine, inherited))
    throw new ApiError('forbidden', 'A child cannot widen its inherited native scope.');
}

interface Scoped {
  readonly kind: string;
  readonly session_id?: string | null;
  readonly model: string | null;
  readonly effort: string | null;
}

function sameScope(left: Scoped, right: Scoped): boolean {
  return JSON.stringify(withoutSession(left)) === JSON.stringify(withoutSession(right));
}

function withoutSession(engine: Scoped): unknown {
  return engine.kind === 'dsh' ? { ...engine, session_id: null } : engine;
}
