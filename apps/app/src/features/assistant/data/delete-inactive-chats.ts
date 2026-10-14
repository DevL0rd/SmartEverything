import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  API_ENDPOINTS as E,
  ApiError,
  type AiAgentRun,
  type AiChatRow,
} from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { removeAiChat } from '../../../api/ai';
import { confirm } from '../../../components/confirm-store';
import { notify } from '../../../components/toast-store';
import { liveTurnOf } from '../../../store/chat-turns';
import { useEntityStore } from '../../../store/store-context';
import type { StoreState } from '../../../store/state';
import { terminalAgent } from '../model/subagent-state';
import { isComputerEngine } from '../provider/computer-engine';
import { agentRunKey } from './agent-runs';

function sessionKey(state: StoreState): string {
  const client = state.session?.client;
  return JSON.stringify([client?.id, client?.profile_id, client?.role]);
}

function boundChild(state: StoreState, run: AiAgentRun): AiChatRow | null {
  const chat = state.tables.ai_chats.byId[run.child_chat_id ?? ''];
  return chat?.kind === 'subagent' &&
    chat.parent_id === run.parent_chat_id &&
    chat.profile_id === run.profile_id
    ? chat
    : null;
}

function stillEligible(state: StoreState, run: AiAgentRun, initiatingSession: string): boolean {
  if (
    state.sync.status !== 'live' ||
    sessionKey(state) !== initiatingSession ||
    !terminalAgent(run)
  )
    return false;
  const chat = boundChild(state, run);
  if (chat === null) return false;
  const turn = liveTurnOf(state.turns, chat.id);
  return (
    (turn === null || turn.state === 'failed') &&
    (!isComputerEngine(chat.engine) || state.session?.client.role === 'owner')
  );
}

async function removeTerminalChild(childId: string, runId: string): Promise<boolean> {
  try {
    await removeAiChat(childId, runId);
    return true;
  } catch (error) {
    if (error instanceof ApiError && error.code === 'conflict') return false;
    throw error;
  }
}

async function removeInactive(
  runs: readonly AiAgentRun[],
  readState: () => StoreState,
  initiatingSession: string,
  onDeleted: (id: string) => void,
): Promise<number> {
  let removed = 0;
  for (const snapshot of runs) {
    if (!stillEligible(readState(), snapshot, initiatingSession)) continue;
    const { run } = await api().call(E.readAiAgentRun, {
      params: { chatId: snapshot.parent_chat_id, agentRunId: snapshot.id },
      query: { limit: 1 },
    });
    if (
      run.child_chat_id !== snapshot.child_chat_id ||
      !stillEligible(readState(), run, initiatingSession)
    )
      continue;
    if (run.child_chat_id === null) continue;
    if (!(await removeTerminalChild(run.child_chat_id, run.id))) continue;
    onDeleted(run.child_chat_id);
    removed += 1;
  }
  if (removed < runs.length)
    notify({
      message: 'Some chats were retained because their activity or access changed.',
      tone: 'default',
    });
  return removed;
}

export function useDeleteInactiveChats(
  parentId: string,
  onDeleted: (id: string) => void,
): ReturnType<typeof useMutation<number, Error, readonly AiAgentRun[]>> {
  const store = useEntityStore();
  const client = useQueryClient();
  return useMutation<number, Error, readonly AiAgentRun[]>({
    mutationFn: async (runs) => {
      const initiatingSession = sessionKey(store.get());
      const accepted = await confirm({
        title: `Delete ${String(runs.length)} inactive subagent chats?`,
        body: 'Their messages, attachments and spawned subagent chats are deleted too. Active or unverified chats are retained.',
        confirmLabel: 'Delete all inactive',
        tone: 'destructive',
      });
      return accepted ? removeInactive(runs, store.get, initiatingSession, onDeleted) : 0;
    },
    onSuccess: (removed) => {
      void client.invalidateQueries({ queryKey: agentRunKey(parentId) });
      if (removed > 0) notify({ message: `${String(removed)} inactive chats deleted` });
    },
    onError: (error) =>
      notify({ message: 'Inactive chats could not all be deleted', error, tone: 'critical' }),
  });
}
