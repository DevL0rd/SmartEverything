import { Logger, background } from '@smarteverything/logging';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useScreenQuery } from '../../../queries/use-screen-query';
import {
  API_ENDPOINTS as E,
  type CodexAnswer,
  type CODEX_PROVIDER_CONTROL,
  type CODEX_PROVIDER_READ_QUERY,
} from '@smarteverything/domain';
import type { z } from 'zod';
import { api } from '../../../api/transport';
import { notify } from '../../../components/toast-store';
import { codexProviderKey, type CodexChatProvider } from '../../../queries/codex-provider-events';

const log = new Logger('app.provider');

export function useCodexProvider(
  chatId: string,
  enabled: boolean,
): ReturnType<typeof useScreenQuery<CodexChatProvider>> {
  return useScreenQuery({
    queryKey: codexProviderKey(chatId),
    enabled: enabled,
    queryFn: async () => {
      const state = await api().call(E.readAiChatProvider, { params: { chatId } });
      if (!('runtime' in state) || state.runtime !== 'codex')
        throw new Error('Expected Codex provider state from this hub.');
      return state;
    },
  });
}
export function useCodexRead(
  chatId: string,
  query: z.output<typeof CODEX_PROVIDER_READ_QUERY>,
  enabled: boolean,
): ReturnType<typeof useScreenQuery<z.output<typeof E.readAiChatProviderState.response>>> {
  return useScreenQuery({
    queryKey: [...codexProviderKey(chatId), 'read', query],
    enabled,
    queryFn: () =>
      api().call(E.readAiChatProviderState, {
        params: { chatId },
        body: { runtime: 'codex', query },
      }),
  });
}
export function useCodexControl(
  chatId: string,
): ReturnType<
  typeof useMutation<
    z.output<typeof E.controlAiChatProvider.response>,
    Error,
    z.output<typeof CODEX_PROVIDER_CONTROL>
  >
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (control: z.output<typeof CODEX_PROVIDER_CONTROL>) => {
      log.info('codex_control.started', { chatId, control: control.action });
      return api().call(E.controlAiChatProvider, {
        params: { chatId },
        body: { runtime: 'codex', control },
      });
    },
    onSuccess: (_result, control) => {
      log.info('codex_control.succeeded', { chatId, control: control.action });
      background(
        client.invalidateQueries({ queryKey: codexProviderKey(chatId) }),
        'queries.invalidate_failed',
      );
    },
    onError: (error, control) => {
      log.error('codex_control.failed', error, { chatId, control: control.action });
      notify({ message: 'Codex action failed', error, tone: 'critical' });
    },
  });
}
export function useCodexAnswer(
  chatId: string,
  promptId: string,
): ReturnType<typeof useMutation<unknown, Error, CodexAnswer>> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (answer: CodexAnswer) => {
      log.info('codex_answer.started', { chatId, promptId });
      return api().call(E.answerAiChatProvider, {
        params: { chatId, promptId },
        body: { runtime: 'codex', answer },
      });
    },
    onSuccess: () => {
      log.info('codex_answer.succeeded', { chatId, promptId });
      background(
        client.invalidateQueries({ queryKey: codexProviderKey(chatId) }),
        'queries.invalidate_failed',
      );
    },
    onError: (error) => {
      log.error('codex_answer.failed', error, { chatId, promptId });
      notify({ message: 'Codex answer wasn’t accepted', error, tone: 'critical' });
    },
  });
}
