import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  API_ENDPOINTS as E,
  type CodexAnswer,
  type CODEX_PROVIDER_CONTROL,
  type CODEX_PROVIDER_READ_QUERY,
} from '@smarteverything/domain';
import type { z } from 'zod';
import { api } from '../../../api/transport';
import { useRuntimeSupported } from '../../computers/data/computer-runtime';
import { notify } from '../../../components/toast-store';
import { codexProviderKey, type CodexChatProvider } from '../../../queries/codex-provider-events';
import { mergeCodexProviderSnapshot } from '../../../queries/codex-provider-notices';

export function useCodexProvider(
  chatId: string,
  enabled: boolean,
): ReturnType<typeof useQuery<CodexChatProvider>> {
  const client = useQueryClient();
  const supported = useRuntimeSupported();
  return useQuery({
    queryKey: codexProviderKey(chatId),
    enabled: enabled && supported,
    queryFn: async () => {
      const state = await api().call(E.readAiChatProvider, { params: { chatId } });
      if (!('runtime' in state) || state.runtime !== 'codex')
        throw new Error('Expected Codex provider state from this hub.');
      return mergeCodexProviderSnapshot(client, chatId, state);
    },
  });
}
export function useCodexRead(
  chatId: string,
  query: z.output<typeof CODEX_PROVIDER_READ_QUERY>,
  enabled: boolean,
): ReturnType<typeof useQuery<z.output<typeof E.readAiChatProviderState.response>>> {
  return useQuery({
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
    mutationFn: (control: z.output<typeof CODEX_PROVIDER_CONTROL>) =>
      api().call(E.controlAiChatProvider, {
        params: { chatId },
        body: { runtime: 'codex', control },
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: codexProviderKey(chatId) });
    },
    onError: (error) => notify({ message: 'Codex action failed', error, tone: 'critical' }),
  });
}
export function useCodexAnswer(
  chatId: string,
  promptId: string,
): ReturnType<typeof useMutation<unknown, Error, CodexAnswer>> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (answer: CodexAnswer) =>
      api().call(E.answerAiChatProvider, {
        params: { chatId, promptId },
        body: { runtime: 'codex', answer },
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: codexProviderKey(chatId) });
    },
    onError: (error) =>
      notify({ message: 'Codex answer wasn’t accepted', error, tone: 'critical' }),
  });
}
