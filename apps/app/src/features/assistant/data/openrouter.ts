import {
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import {
  AI_MODEL_ENDPOINTS as M,
  type AiCatalogueSync,
  type AiEffort,
  type AiModelChoice,
  type OpenRouterAccount,
  type OpenRouterStatus,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { api } from '../../../api/transport';
import { AI_MODELS_PREFIX, OPENROUTER_ACCOUNT_KEY } from '../../../queries/keys';
import { useIsOwner } from '../../../store/selectors';

const log = new Logger('app.openrouter');

const STATUS_KEY = ['window', 'openrouter', 'status'] as const;

export function useOpenRouterStatus(): UseQueryResult<OpenRouterStatus> {
  return useQuery({
    queryKey: STATUS_KEY,
    queryFn: () => api().call(M.readOpenRouter, {}),
  });
}

export function useOpenRouterAccount(keySet: boolean): UseQueryResult<OpenRouterAccount> {
  const owner = useIsOwner();
  return useQuery({
    queryKey: OPENROUTER_ACCOUNT_KEY,
    queryFn: () => api().call(M.readOpenRouterAccount, {}),
    enabled: owner && keySet,
  });
}

function keyChanged(client: QueryClient, status: OpenRouterStatus): OpenRouterStatus {
  client.setQueryData(STATUS_KEY, status);
  void client.invalidateQueries({ queryKey: OPENROUTER_ACCOUNT_KEY });
  void client.invalidateQueries({ queryKey: AI_MODELS_PREFIX });
  return status;
}

export interface OpenRouterActions {
  readonly saveKey: (key: string) => Promise<OpenRouterStatus>;
  readonly importKey: () => Promise<OpenRouterStatus>;
  readonly removeKey: () => Promise<OpenRouterStatus>;
  readonly setDefaults: (model: AiModelChoice, effort: AiEffort) => Promise<OpenRouterStatus>;
  readonly refresh: () => Promise<AiCatalogueSync>;
  readonly recheckAccount: () => void;
}

export function useOpenRouterActions(): OpenRouterActions {
  const client = useQueryClient();
  return {
    saveKey: async (key): Promise<OpenRouterStatus> => {
      const status = await api().call(M.setOpenRouterKey, { body: { key } });
      log.info('openrouter.key_saved', {});
      return keyChanged(client, status);
    },
    importKey: async (): Promise<OpenRouterStatus> => {
      const status = await api().call(M.importOpenRouterKey, {
        body: { source: 'discordinator' },
      });
      log.info('openrouter.key_imported', { source: 'discordinator' });
      return keyChanged(client, status);
    },
    removeKey: async (): Promise<OpenRouterStatus> => {
      const status = await api().call(M.removeOpenRouterKey, {});
      log.info('openrouter.key_removed', {});
      client.removeQueries({ queryKey: OPENROUTER_ACCOUNT_KEY });
      return keyChanged(client, status);
    },
    setDefaults: async (model, effort): Promise<OpenRouterStatus> => {
      const status = await api().call(M.setOpenRouterDefaults, {
        body: { default_model: model, default_effort: effort },
      });
      client.setQueryData(STATUS_KEY, status);
      void client.invalidateQueries({ queryKey: AI_MODELS_PREFIX });
      return status;
    },
    refresh: async (): Promise<AiCatalogueSync> => {
      const sync = await api().call(M.refreshAiModels, {});
      log.info('openrouter.catalogue_refreshed', {
        models: sync.models,
        added: sync.added,
      });
      void client.invalidateQueries({ queryKey: AI_MODELS_PREFIX });
      void client.invalidateQueries({ queryKey: STATUS_KEY });
      return sync;
    },
    recheckAccount: (): void => {
      void client.invalidateQueries({ queryKey: OPENROUTER_ACCOUNT_KEY });
    },
  };
}
