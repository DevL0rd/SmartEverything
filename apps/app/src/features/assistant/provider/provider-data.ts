import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import type { PROVIDER_READ_QUERY } from '@smarteverything/domain';
import {
  API_ENDPOINTS as E,
  type AiChatProvider,
  type ProviderAnswer,
  type ProviderControl,
  type Engine,
  type JsonValue,
} from '@smarteverything/domain';
import type { z } from 'zod';
import { useServerComputerAi } from '../../../api/connection/server-capabilities';
import { api, useConnection } from '../../../api/transport';
import { notify } from '../../../components/toast-store';
import { providerKey } from '../../../queries/keys';
import { mergeProviderSnapshot } from '../../../queries/provider-notices';
import { engineCatalogue, type EngineCatalogue } from './engine-catalogue';
import { serverSupportsComputerAiV2 } from '../../../api/connection/server-capabilities';
import type { AiRuntimeEnginePreference, ComputerAiRuntime } from '@smarteverything/domain';

export const ENGINE_CATALOGUE_KEY = ['window', 'ai-engines'] as const;

export function useComputerProviderSupported(): boolean {
  const connection = useConnection();
  return useServerComputerAi(connection.status === 'paired' ? connection.connection.url : null);
}

export function useEngineCatalogue(): UseQueryResult<EngineCatalogue> {
  const supported = useComputerProviderSupported();
  return useQuery({
    enabled: supported,
    queryKey: ENGINE_CATALOGUE_KEY,
    queryFn: async () => engineCatalogue(await api().call(E.readAiEngineCatalogue, {})),
  });
}

export function useEngineDefaultChange(): UseMutationResult<
  { engine: Engine | null },
  Error,
  Engine | null
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (engine: Engine | null) =>
      api().call(E.updateAiEngineDefault, { body: { engine } }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ENGINE_CATALOGUE_KEY });
    },
    onError: (error) =>
      notify({ message: 'Default engine wasn’t changed', error, tone: 'critical' }),
  });
}

export function useModelMachineChange(): UseMutationResult<
  AiRuntimeEnginePreference,
  Error,
  { readonly runtime: ComputerAiRuntime; readonly model: string; readonly deviceId: string }
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ runtime, model, deviceId }) => {
      if (serverSupportsComputerAiV2(api().baseUrl))
        return api().call(E.updateAiRuntimeEnginePreference, {
          params: { runtime, modelId: model },
          body: { device_id: deviceId },
        });
      if (runtime !== 'claude') throw new Error('This hub needs an update to select Codex.');
      const preference = await api().call(E.updateAiEnginePreference, {
        params: { modelId: model },
        body: { device_id: deviceId },
      });
      return { ...preference, runtime };
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ENGINE_CATALOGUE_KEY });
    },
    onError: (error) =>
      notify({ message: 'Supplying computer wasn’t saved', error, tone: 'critical' }),
  });
}

export function useChatProvider(chatId: string, enabled = true): UseQueryResult<AiChatProvider> {
  const client = useQueryClient();
  return useQuery({
    queryKey: [...providerKey(chatId), 'state'],
    queryFn: async () => mergeProviderSnapshot(client, chatId, await readClaudeProvider(chatId)),
    enabled,
  });
}

async function readClaudeProvider(chatId: string): Promise<AiChatProvider> {
  const state = await api().call(E.readAiChatProvider, { params: { chatId } });
  if ('runtime' in state && state.runtime === 'codex')
    throw new Error('Expected Claude provider state, received Codex.');
  return state;
}

export function useProviderRead(
  chatId: string,
  body: z.infer<typeof PROVIDER_READ_QUERY>,
  enabled: boolean,
): UseQueryResult<JsonValue> {
  return useQuery({
    queryKey: [...providerKey(chatId), 'read', body],
    queryFn: () => api().call(E.readAiChatProviderState, { params: { chatId }, body }),
    enabled,
  });
}

export function useProviderControl(
  chatId: string,
): UseMutationResult<JsonValue, Error, ProviderControl> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: ProviderControl) =>
      api().call(E.controlAiChatProvider, { params: { chatId }, body }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: providerKey(chatId) });
    },
    onError: (error) => notify({ message: 'Provider action failed', error, tone: 'critical' }),
  });
}

export function useProviderAnswer(
  chatId: string,
  promptId: string,
): UseMutationResult<unknown, Error, ProviderAnswer> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: ProviderAnswer) =>
      api().call(E.answerAiChatProvider, { params: { chatId, promptId }, body }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: providerKey(chatId) });
    },
    onError: (error) =>
      notify({ message: 'Provider prompt wasn’t answered', error, tone: 'critical' }),
  });
}
