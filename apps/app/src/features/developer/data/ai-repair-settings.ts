import { useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { API_ENDPOINTS as E, type AiRepairSettings } from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { notify } from '../../../components/toast-store';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { AI_REPAIR_GROUPS_KEY } from './ai-repair-inbox';

const SETTINGS_KEY = ['developer', 'ai-repair-settings'] as const;

export function useAiRepairSettings(): UseQueryResult<AiRepairSettings> {
  return useScreenQuery({
    queryKey: SETTINGS_KEY,
    staleTime: 0,
    queryFn: ({ signal }) => api().call(E.readAiRepairSettings, {}, { signal }),
  });
}

export function useAiRepairUpdate(): {
  readonly saving: boolean;
  readonly save: (enabled: boolean) => void;
} {
  const client = useQueryClient();
  const mutation = useMutation({
    networkMode: 'always',
    mutationFn: (enabled: boolean) => api().call(E.updateAiRepairSettings, { body: { enabled } }),
    onSuccess: async (settings): Promise<void> => {
      await client.cancelQueries({ queryKey: SETTINGS_KEY });
      client.setQueryData(SETTINGS_KEY, settings);
      await client.invalidateQueries({ queryKey: AI_REPAIR_GROUPS_KEY });
    },
    onError: (error): void => {
      notify({ message: 'AI repair setting was not saved', error, tone: 'critical' });
    },
  });
  return { saving: mutation.isPending, save: mutation.mutate };
}
