import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { API_ENDPOINTS as E, type PushStatus } from '@smarteverything/domain';
import { PUSH_STATUS_KEY } from '../queries/keys';
import { api } from './transport';

export function usePushDeliveries(): UseQueryResult<PushStatus> {
  return useQuery({ queryKey: PUSH_STATUS_KEY, queryFn: () => api().call(E.readPushStatus, {}) });
}
