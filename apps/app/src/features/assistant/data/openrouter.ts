import { useQueryClient, type QueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useScreenQuery } from '../../../queries/use-screen-query';
import {
  AI_MODEL_ENDPOINTS as M,
  type AiCatalogueSync,
  type AiEffort,
  type AiModelChoice,
  type OpenRouterAccount,
  type OpenRouterStatus,
} from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import { api } from '../../../api/transport';
import { AI_MODELS_PREFIX, OPENROUTER_ACCOUNT_KEY } from '../../../queries/keys';
import { useIsOwner } from '../../../store/selectors';

const log = new Logger('app.openrouter');

const STATUS_KEY = ['window', 'openrouter', 'status'] as const;

export function useOpenRouterStatus(enabled = true): UseQueryResult<OpenRouterStatus> {
  return useScreenQuery({
    queryKey: STATUS_KEY,
    enabled,
    queryFn: () => api().call(M.readOpenRouter, {}),
  });
}

export function useOpenRouterAccount(keySet: boolean): UseQueryResult<OpenRouterAccount> {
  const owner = useIsOwner();
  return useScreenQuery({
    queryKey: OPENROUTER_ACCOUNT_KEY,
    queryFn: () => api().call(M.readOpenRouterAccount, {}),
    enabled: owner && keySet,
  });
}

function keyChanged(client: QueryClient, status: OpenRouterStatus): OpenRouterStatus {
  client.setQueryData(STATUS_KEY, status);
  background(
    client.invalidateQueries({ queryKey: OPENROUTER_ACCOUNT_KEY }),
    'queries.invalidate_failed',
  );
  background(client.invalidateQueries({ queryKey: AI_MODELS_PREFIX }), 'queries.invalidate_failed');
  return status;
}

export interface OpenRouterActions {
  readonly saveKey: (key: string) => Promise<OpenRouterStatus>;
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
      background(
        client.invalidateQueries({ queryKey: AI_MODELS_PREFIX }),
        'queries.invalidate_failed',
      );
      return status;
    },
    refresh: async (): Promise<AiCatalogueSync> => {
      const sync = await api().call(M.refreshAiModels, {});
      log.info('openrouter.catalogue_refreshed', {
        models: sync.models,
        added: sync.added,
      });
      background(
        client.invalidateQueries({ queryKey: AI_MODELS_PREFIX }),
        'queries.invalidate_failed',
      );
      background(client.invalidateQueries({ queryKey: STATUS_KEY }), 'queries.invalidate_failed');
      return sync;
    },
    recheckAccount: (): void => {
      background(
        client.invalidateQueries({ queryKey: OPENROUTER_ACCOUNT_KEY }),
        'queries.invalidate_failed',
      );
    },
  };
}
