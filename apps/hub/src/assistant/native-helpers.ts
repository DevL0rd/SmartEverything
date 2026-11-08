import { ApiError, type AiChatRow, type Engine } from '@smarteverything/domain';

export function admitNativeEngine(engine: Engine, allowed: boolean): void {
  if (!allowed && engine.kind !== 'dsh')
    throw new ApiError(
      'conflict',
      'Select Claude or Codex when creating a new chat or starting a helper.',
    );
  if (engine.kind === 'claude' && engine.continued_from !== undefined)
    throw new ApiError('conflict', 'Start a new session without attaching to an external chat.');
}

export function admitsChatExecution(chat: AiChatRow): boolean {
  return (
    chat.native_admission !== 'retired' &&
    (chat.engine.kind !== 'claude' || chat.engine.continued_from === undefined) &&
    (chat.engine.kind === 'dsh' ||
      chat.native_admission === 'standalone' ||
      (chat.kind === 'subagent' && chat.parent_id !== null))
  );
}

export function admitChatExecution(chat: AiChatRow): void {
  if (!admitsChatExecution(chat))
    throw new ApiError('conflict', 'This retired chat history is read-only.');
}

export function admitChatEngineFamily(chat: AiChatRow, kind: Engine['kind']): void {
  if (chat.kind !== 'subagent' && chat.engine.kind !== kind)
    throw new ApiError('conflict', 'An existing chat must keep its engine family.');
}

export function admitChatEngineChange(chat: AiChatRow, engine: Engine): void {
  admitChatEngineFamily(chat, engine.kind);
  admitNativeEngine(
    engine,
    chat.native_admission === 'standalone' || (chat.kind === 'subagent' && chat.parent_id !== null),
  );
}
