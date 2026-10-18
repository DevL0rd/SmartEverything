import type { QueryClient } from '@tanstack/react-query';
import { background } from '@smarteverything/logging';
import {
  API_ENDPOINTS as E,
  mergePhoneDetail,
  type PhoneDetail,
  type PhoneDetailNotice,
} from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { noticeHandler } from '../../../store/notice-registry';

export type PhoneDetailSection = keyof PhoneDetail;

export interface PhoneDetailLoad {
  readonly detail: PhoneDetail | undefined;
  readonly error: Error | null;
  readonly retry: () => void;
}

export function phoneDetailKey(deviceId: string): readonly ['window', 'phone-detail', string] {
  return ['window', 'phone-detail', deviceId];
}

function readDetail(deviceId: string): Promise<PhoneDetail> {
  return api().call(E.readPhoneDetail, { params: { deviceId } });
}

export function usePhoneDetail(deviceId: string): PhoneDetailLoad {
  const query = useScreenQuery({
    queryKey: phoneDetailKey(deviceId),
    queryFn: () => readDetail(deviceId),
    refetchOnMount: 'always',
  });
  return {
    detail: query.data,
    error: query.error,
    retry: (): void => {
      background(query.refetch(), 'phone_detail.refetch_failed');
    },
  };
}

export function usePhoneSection<K extends PhoneDetailSection>(
  deviceId: string,
  name: K,
): PhoneDetail[K] | undefined {
  return useScreenQuery({
    queryKey: phoneDetailKey(deviceId),
    queryFn: () => readDetail(deviceId),
    select: (detail) => detail[name],
  }).data;
}

async function rereadDetail(client: QueryClient, key: readonly unknown[]): Promise<void> {
  await client.cancelQueries({ queryKey: key, exact: true });
  await client.invalidateQueries({ queryKey: key, exact: true });
}

export function receivePhoneDetail(client: QueryClient, notice: PhoneDetailNotice): void {
  const key = phoneDetailKey(notice.deviceId);
  if (client.getQueryState(key) === undefined) return;
  const stored = client.getQueryData<PhoneDetail>(key);
  if (stored === undefined || client.isFetching({ queryKey: key, exact: true }) > 0) {
    background(rereadDetail(client, key), 'phone_detail.reread_failed');
    return;
  }
  client.setQueryData<PhoneDetail>(key, mergePhoneDetail(stored, notice.parts));
}

export const PHONE_DETAIL_NOTICES = noticeHandler(['phone_detail'], (message, { client }) => {
  receivePhoneDetail(client, message);
});
