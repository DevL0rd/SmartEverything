import { useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { AI_DEEPSEEK_ENDPOINTS as D, type DeepSeekStatus } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { api } from '../../../api/transport';
import { useScreenQuery } from '../../../queries/use-screen-query';
import type { DeepSeekKeyActions } from '../provider/deepseek-row';

const log = new Logger('app.deepseek');

const STATUS_KEY = ['window', 'deepseek', 'status'] as const;

export function useDeepSeekStatus(): UseQueryResult<DeepSeekStatus> {
  return useScreenQuery({
    queryKey: STATUS_KEY,
    queryFn: () => api().call(D.readDeepSeek, {}),
  });
}

export function useDeepSeekActions(): DeepSeekKeyActions {
  const client = useQueryClient();
  return {
    saveKey: async (key): Promise<DeepSeekStatus> => {
      const status = await api().call(D.setDeepSeekKey, { body: { key } });
      log.info('deepseek.key_saved', {});
      client.setQueryData(STATUS_KEY, status);
      return status;
    },
    removeKey: async (): Promise<DeepSeekStatus> => {
      const status = await api().call(D.removeDeepSeekKey, {});
      log.info('deepseek.key_removed', {});
      client.setQueryData(STATUS_KEY, status);
      return status;
    },
  };
}
