import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { API_ENDPOINTS as E, type HistoryRow } from '@smarteverything/domain';
import { api } from '../api/transport';
import { historyKey } from './keys';

export function readHistory(capabilities: readonly string[], since: string): Promise<HistoryRow[]> {
  return api().call(E.readHistory, { query: { capabilities: [...capabilities], from: since } });
}

export function useHistory(
  capabilities: readonly string[],
  sinceHours: number,
): UseQueryResult<HistoryRow[]> {
  return useQuery({
    queryKey: historyKey(capabilities, sinceHours),
    queryFn: () =>
      readHistory(capabilities, new Date(Date.now() - sinceHours * 3_600_000).toISOString()),
  });
}
