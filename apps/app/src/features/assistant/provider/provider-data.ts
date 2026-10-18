import { Logger, background } from '@smarteverything/logging';
import {
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import { useScreenQuery } from '../../../queries/use-screen-query';
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
import { api } from '../../../api/transport';
import { notify } from '../../../components/toast-store';
import { providerKey } from '../../../queries/keys';
import { engineCatalogue, type EngineCatalogue } from './engine-catalogue';
import type { AiRuntimeEnginePreference, ComputerAiRuntime } from '@smarteverything/domain';

const log = new Logger('app.provider');

export const ENGINE_CATALOGUE_KEY = ['window', 'ai-engines'] as const;

export function useEngineCatalogue(): UseQueryResult<EngineCatalogue> {
  return useScreenQuery({
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
    mutationFn: (engine: Engine | null) => {
      log.info('engine_default.change_started', { engineKind: engine?.kind ?? null });
      return api().call(E.updateAiEngineDefault, { body: { engine } });
    },
    onSuccess: () => {
      log.info('engine_default.change_succeeded');
      background(
        client.invalidateQueries({ queryKey: ENGINE_CATALOGUE_KEY }),
        'queries.invalidate_failed',
      );
    },
    onError: (error) => {
      log.error('engine_default.change_failed', error);
      notify({ message: 'Default engine wasn’t changed', error, tone: 'critical' });
    },
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
      log.info('model_machine.change_started', { runtime, model, deviceId });
      return api().call(E.updateAiRuntimeEnginePreference, {
        params: { runtime, modelId: model },
        body: { device_id: deviceId },
      });
    },
    onSuccess: (_result, { runtime, model, deviceId }) => {
      log.info('model_machine.change_succeeded', { runtime, model, deviceId });
      background(
        client.invalidateQueries({ queryKey: ENGINE_CATALOGUE_KEY }),
        'queries.invalidate_failed',
      );
    },
    onError: (error, { runtime, model, deviceId }) => {
      log.error('model_machine.change_failed', error, { runtime, model, deviceId });
      notify({ message: 'Supplying computer wasn’t saved', error, tone: 'critical' });
    },
  });
}

export function useChatProvider(chatId: string, enabled = true): UseQueryResult<AiChatProvider> {
  return useScreenQuery({
    queryKey: [...providerKey(chatId), 'state'],
    queryFn: () => readClaudeProvider(chatId),
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
  return useScreenQuery({
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
    mutationFn: (body: ProviderControl) => {
      log.info('provider_control.started', { chatId, control: body.action });
      return api().call(E.controlAiChatProvider, { params: { chatId }, body });
    },
    onSuccess: (_result, body) => {
      log.info('provider_control.succeeded', { chatId, control: body.action });
      background(
        client.invalidateQueries({ queryKey: providerKey(chatId) }),
        'queries.invalidate_failed',
      );
    },
    onError: (error, body) => {
      log.error('provider_control.failed', error, { chatId, control: body.action });
      notify({ message: 'Provider action failed', error, tone: 'critical' });
    },
  });
}

export function useProviderAnswer(
  chatId: string,
  promptId: string,
): UseMutationResult<unknown, Error, ProviderAnswer> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: ProviderAnswer) => {
      log.info('provider_answer.started', { chatId, promptId });
      return api().call(E.answerAiChatProvider, { params: { chatId, promptId }, body });
    },
    onSuccess: () => {
      log.info('provider_answer.succeeded', { chatId, promptId });
      background(
        client.invalidateQueries({ queryKey: providerKey(chatId) }),
        'queries.invalidate_failed',
      );
    },
    onError: (error) => {
      log.error('provider_answer.failed', error, { chatId, promptId });
      notify({ message: 'Your answer wasn’t sent', error, tone: 'critical' });
    },
  });
}
