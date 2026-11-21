import { ApiError, type AiAgentRun, type AiChatRow } from '@smarteverything/domain';
import { storeUnit } from '../../store/host/unit';

const TERMINAL: ReadonlySet<AiAgentRun['state']> = new Set([
  'completed',
  'stopped',
  'interrupted',
  'failed',
]);

export interface InactiveScope {
  readonly profileId: string;
  readonly chatId: string;
  readonly runId: string | null;
  readonly scope: readonly string[];
}

export const INACTIVE_REMOVAL_UNIT = storeUnit(
  (store, input: InactiveScope): { readonly chats: AiChatRow[]; readonly busy: boolean } => {
    if (input.runId !== null) {
      const run = store.aiAgentRuns.find(input.runId);
      if (run?.profile_id !== input.profileId || run.child_chat_id !== input.chatId)
        throw new ApiError('conflict', 'That subagent run does not belong to this conversation.');
      if (!run.supported_actions.includes('delete'))
        throw new ApiError('conflict', 'This helper has not advertised that it can be deleted.');
    } else if (store.aiChats.chat(input.chatId).kind !== 'subagent')
      throw new ApiError('conflict', 'Only inactive helper conversations can be deleted here.');
    const chats = input.scope.map((id) => store.aiChats.chat(id));
    return {
      chats,
      busy: chats.some(
        (chat) =>
          chat.pending_requests > 0 ||
          store.assistantEvents.hasUnsettledChatWork(chat.id) ||
          store.aiAgentRuns.ofChat(chat.id).some((entry) => !TERMINAL.has(entry.state)),
      ),
    };
  },
);

export const REMOVAL_NEEDS_INACTIVE_UNIT = storeUnit(
  (store, input: { readonly chatId: string }): boolean =>
    store.aiChats.find(input.chatId)?.kind === 'subagent',
);
