import { ApiError, type AiAgentRun, type AiChatRow } from '@smarteverything/domain';
import type { Store } from '../../store/store';
import type { ChatOwner } from '../chat-directory';
import type { EngineStatus } from '../engines/engine';

const TERMINAL: ReadonlySet<AiAgentRun['state']> = new Set([
  'completed',
  'stopped',
  'interrupted',
  'failed',
]);

interface InactiveRemoval {
  readonly store: Store;
  readonly owner: ChatOwner;
  readonly chatId: string;
  readonly runId?: string;
  readonly status: (chat: AiChatRow) => EngineStatus | null;
}

function admitChildRun(deps: InactiveRemoval, id: string): void {
  const { store, owner, chatId } = deps;
  const run = store.aiAgentRuns.find(id);
  if (run?.profile_id !== owner.profileId || run.child_chat_id !== chatId)
    throw new ApiError('conflict', 'That subagent run does not belong to this conversation.');
  if (!run.supported_actions.includes('delete'))
    throw new ApiError('conflict', 'This helper has not advertised that it can be deleted.');
}

export function admitInactiveRemoval(deps: InactiveRemoval, scope: readonly AiChatRow[]): void {
  const { store, chatId, runId } = deps;
  if (runId !== undefined) admitChildRun(deps, runId);
  else if (store.aiChats.chat(chatId).kind !== 'subagent')
    throw new ApiError('conflict', 'Only inactive helper conversations can be deleted here.');
  for (const target of scope) {
    const chat = store.aiChats.chat(target.id);
    if (
      chat.pending_requests > 0 ||
      deps.status(chat)?.state === 'working' ||
      store.assistantEvents.hasUnsettledChatWork(chat.id) ||
      store.aiAgentRuns.ofChat(chat.id).some((entry) => !TERMINAL.has(entry.state))
    )
      throw activeConflict();
  }
}

function activeConflict(): ApiError {
  return new ApiError('conflict', 'This child conversation is still working, so it was kept.');
}
