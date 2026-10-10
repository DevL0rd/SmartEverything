import { useCallback } from 'react';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import {
  REACH_ENDPOINTS as R,
  type AiOutreachRow,
  type ReachSettings,
  type ReachSettingsChange,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { api } from '../../../api/transport';
import { REACH_PREFIX } from '../../../queries/keys';

const log = new Logger('app.reach');

const SETTINGS_KEY = [...REACH_PREFIX, 'settings'] as const;

const OUTREACH_KEY = [...REACH_PREFIX, 'outreach'] as const;

export const OUTREACH_SHOWN = 10;

export function useReachSettings(): UseQueryResult<ReachSettings> {
  return useQuery({ queryKey: SETTINGS_KEY, queryFn: () => api().call(R.readReachSettings, {}) });
}

export function useReachUpdate(): (change: ReachSettingsChange) => Promise<ReachSettings> {
  const client = useQueryClient();
  return async (change) => {
    const settings = await api().call(R.updateReachSettings, { body: change });
    log.info('reach.settings_saved', { fields: Object.keys(change) });
    client.setQueryData(SETTINGS_KEY, settings);
    return settings;
  };
}

export function useOutreach(): UseQueryResult<AiOutreachRow[]> {
  return useQuery({
    queryKey: OUTREACH_KEY,
    queryFn: () => api().call(R.listOutreach, { query: { limit: OUTREACH_SHOWN } }),
  });
}

export function useRefreshOutreach(): () => void {
  const client = useQueryClient();
  return useCallback((): void => {
    client.invalidateQueries({ queryKey: OUTREACH_KEY }).catch((error: unknown) => {
      log.warn('reach.refresh_failed', { reason: String(error) });
    });
  }, [client]);
}

export async function declineOutreach(outreachId: string): Promise<void> {
  await api().call(R.declineOutreach, { params: { outreachId } });
  log.info('reach.declined', { outreachId });
}
