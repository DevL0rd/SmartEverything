import { Logger, background } from '@smarteverything/logging';
import { useEffect } from 'react';
import { CancelledError, useMutation, useQueryClient } from '@tanstack/react-query';
import { useScreenQuery } from '../../../queries/use-screen-query';
import {
  AI_HARNESS_ENDPOINTS as E,
  type AiHarnessAnswer,
  type AiHarnessHandoffRequest,
  type AiHarnessSwitchResult,
  type AiHarnessSession,
  type AiHarnessCatalogue,
} from '@smarteverything/domain';
import { api } from '../../../api/transport';
import type { EntityStore } from '../../../store/entity-store';
import type { StoreState } from '../../../store/state';
import { sameJson } from '../../../store/same-json';
import { shallowEqual, useEntityStore } from '../../../store/store-context';
import { settleChatTurns } from '../../../store/chat-turns';
import { HARNESS_CATALOGUE_KEY, harnessKey } from '../../../queries/harness-notices';

const log = new Logger('app.harness');
export { HARNESS_CATALOGUE_KEY, harnessKey } from '../../../queries/harness-notices';

export function useHarnessCatalogue(): ReturnType<typeof useScreenQuery<AiHarnessCatalogue>> {
  return useScreenQuery({
    queryKey: HARNESS_CATALOGUE_KEY,
    queryFn: () => api().call(E.readAiHarnessCatalogue, {}),
  });
}
function bindingOf(state: StoreState, chatId: string): readonly unknown[] {
  const chat = state.tables.ai_chats.byId[chatId];
  return [state.session?.client, chat?.engine, chat?.profile_id];
}

export function refetchOnBindingChange(
  store: EntityStore,
  chatId: string,
  refetch: () => void,
): () => void {
  let seen = bindingOf(store.get(), chatId);
  return store.subscribeSlices(['session', 'tables.ai_chats'], () => {
    const next = bindingOf(store.get(), chatId);
    if (shallowEqual(seen, next) || sameJson(seen, next)) return;
    seen = next;
    refetch();
  });
}

export function useChatHarness(
  chatId: string,
  enabled: boolean,
): ReturnType<typeof useScreenQuery<AiHarnessSession>> {
  const store = useEntityStore();
  const client = useQueryClient();
  useEffect(
    () =>
      refetchOnBindingChange(store, chatId, () => {
        background(
          client.refetchQueries({ queryKey: harnessKey(chatId), type: 'active' }),
          'queries.refetch_failed',
        );
      }),
    [store, client, chatId],
  );
  return useScreenQuery({
    queryKey: harnessKey(chatId),
    enabled: enabled,
    queryFn: async ({ signal }) => {
      const observed = store.get();
      const startedAt = Date.now();
      const session = await api()
        .call(E.readAiChatHarness, { params: { chatId } })
        .catch((error: unknown) => {
          log.warn('harness.read_failed', {
            chatId,
            error: error instanceof Error ? error.name : typeof error,
            durationMs: Date.now() - startedAt,
          });
          throw error;
        });
      if (signal.aborted) {
        log.debug('harness.read_aborted', { chatId });
        throw new CancelledError({ silent: true });
      }
      log.debug('harness.read', () => ({
        chatId,
        state: session.state,
        durationMs: Date.now() - startedAt,
      }));
      if (session.state === 'idle')
        store.update((state) => ({
          ...state,
          turns: settleChatTurns(state.turns, observed.turns, chatId),
        }));
      return session;
    },
  });
}

export function useHarnessSwitch(
  chatId: string,
): ReturnType<typeof useMutation<AiHarnessSwitchResult, Error, AiHarnessHandoffRequest>> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: AiHarnessHandoffRequest) => {
      log.info('harness.switch_started', { chatId });
      return api().call(E.switchAiChatHarness, { params: { chatId }, body });
    },
    onSuccess: () => {
      log.info('harness.switch_succeeded', { chatId });
      return client.invalidateQueries({ queryKey: harnessKey(chatId) });
    },
    onError: (error) => {
      log.error('harness.switch_failed', error, { chatId });
      return client.invalidateQueries({ queryKey: harnessKey(chatId) });
    },
  });
}
export function useHarnessAnswer(
  chatId: string,
): ReturnType<typeof useMutation<unknown, Error, AiHarnessAnswer>> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: AiHarnessAnswer) => {
      log.info('harness.answer_started', { chatId });
      return api().call(E.answerAiChatHarness, { params: { chatId }, body });
    },
    onSuccess: () => {
      log.info('harness.answer_succeeded', { chatId });
      background(
        client.invalidateQueries({ queryKey: harnessKey(chatId) }),
        'queries.invalidate_failed',
      );
    },
    onError: (error) => {
      log.error('harness.answer_failed', error, { chatId });
    },
  });
}
