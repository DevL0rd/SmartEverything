import { CancelledError, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AI_HARNESS_ENDPOINTS as E,
  type AiHarnessAnswer,
  type AiHarnessHandoffRequest,
  type AiHarnessHandoff,
  type AiHarnessSession,
  type AiHarnessCatalogue,
} from '@smarteverything/domain';
import { api, useConnection } from '../../../api/transport';
import { useServerAiHarness } from '../../../api/connection/server-capabilities';
import { useSyncStatus } from '../../../store/selectors';
import { useEntityStore } from '../../../store/store-context';
import type { StoreState } from '../../../store/state';
import { settleChatTurns } from '../../../store/chat-turns';
import {
  HARNESS_CATALOGUE_KEY,
  harnessKey,
  harnessReadRevision,
} from '../../../queries/harness-notices';
export { HARNESS_CATALOGUE_KEY, harnessKey } from '../../../queries/harness-notices';

export function useHarnessSupported(): boolean {
  const connection = useConnection();
  return useServerAiHarness(connection.status === 'paired' ? connection.connection.url : null);
}
export function useHarnessSupportReason(): string | null {
  const supported = useHarnessSupported();
  const sync = useSyncStatus();
  if (supported) return null;
  if (sync.status === 'live')
    return 'Update the hub to use the SmartEverything runtime. Existing engines remain available.';
  if (sync.status === 'connecting' || sync.status === 'loading')
    return 'Waiting for the hub connection before checking runtime availability…';
  return (
    sync.problem ??
    'Hub unavailable. Cached conversations remain readable; reconnect to resume work.'
  );
}
export function useHarnessCatalogue(): ReturnType<typeof useQuery<AiHarnessCatalogue>> {
  const supported = useHarnessSupported();
  return useQuery({
    queryKey: HARNESS_CATALOGUE_KEY,
    enabled: supported,
    queryFn: () => api().call(E.readAiHarnessCatalogue, {}),
  });
}
export function useChatHarness(
  chatId: string,
  enabled: boolean,
): ReturnType<typeof useQuery<AiHarnessSession>> {
  const supported = useHarnessSupported();
  const store = useEntityStore();
  const client = useQueryClient();
  return useQuery({
    queryKey: harnessKey(chatId),
    enabled: enabled && supported,
    queryFn: async ({ signal }) => {
      for (;;) {
        assertHarnessReadActive(signal);
        const observed = store.get();
        const revision = harnessReadRevision(client, chatId);
        const session = await api().call(E.readAiChatHarness, { params: { chatId } });
        assertHarnessReadActive(signal);
        const current = store.get();
        if (
          revision !== harnessReadRevision(client, chatId) ||
          !sameHarnessBinding(observed, current, chatId)
        )
          continue;
        if (session.state === 'idle')
          store.update((state) => ({
            ...state,
            turns: settleChatTurns(state.turns, observed.turns, chatId),
          }));
        return session;
      }
    },
  });
}

function sameHarnessBinding(left: StoreState, right: StoreState, chatId: string): boolean {
  const before = left.tables.ai_chats.byId[chatId];
  const after = right.tables.ai_chats.byId[chatId];
  return (
    left.session?.client === right.session?.client &&
    before?.engine === after?.engine &&
    before?.profile_id === after?.profile_id
  );
}

function assertHarnessReadActive(signal: AbortSignal): void {
  if (signal.aborted) throw new CancelledError({ silent: true });
}
export function useHarnessSwitch(
  chatId: string,
): ReturnType<typeof useMutation<AiHarnessHandoff, Error, AiHarnessHandoffRequest>> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: AiHarnessHandoffRequest) =>
      api().call(E.switchAiChatHarness, { params: { chatId }, body }),
    onSuccess: () => client.invalidateQueries({ queryKey: harnessKey(chatId) }),
    onError: () => client.invalidateQueries({ queryKey: harnessKey(chatId) }),
  });
}
export function useHarnessAnswer(
  chatId: string,
): ReturnType<typeof useMutation<unknown, Error, AiHarnessAnswer>> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: AiHarnessAnswer) =>
      api().call(E.answerAiChatHarness, { params: { chatId }, body }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: harnessKey(chatId) });
    },
  });
}
