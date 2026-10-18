import type { InfiniteData } from '@tanstack/react-query';
import type { DeviceLogEntry } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { deviceLogKey } from '../../../queries/keys';
import { readDeviceLog } from '../../../queries/device-log';
import { useScreenInfiniteQuery, useScreenQuery } from '../../../queries/use-screen-query';
import { LOG_PAGE_SIZE, nextLogCursor } from './log-model';

export function useLatestLogEntry(deviceId: string, enabled: boolean): DeviceLogEntry | undefined {
  return useScreenQuery({
    queryKey: deviceLogKey(deviceId, 1),
    queryFn: () => readDeviceLog(deviceId, 1),
    enabled,
  }).data?.[0];
}

export interface DeviceLogPages {
  readonly entries: readonly DeviceLogEntry[];
  readonly loading: boolean;
  readonly failure: Error | null;
  readonly more: boolean;
  readonly loadingMore: boolean;
  readonly loadMore: () => void;
  readonly retry: () => void;
}

export function useDeviceLogPages(deviceId: string): DeviceLogPages {
  const query = useScreenInfiniteQuery<
    DeviceLogEntry[],
    Error,
    InfiniteData<DeviceLogEntry[]>,
    readonly (string | number)[],
    string | undefined
  >({
    queryKey: deviceLogKey(deviceId, 'pages'),
    queryFn: ({ pageParam }) => readDeviceLog(deviceId, LOG_PAGE_SIZE, pageParam),
    initialPageParam: undefined,
    getNextPageParam: nextLogCursor,
  });
  const { fetchNextPage, refetch } = query;
  return {
    entries: (query.data?.pages ?? []).flat(),
    loading: query.isPending,
    failure: query.isError ? query.error : null,
    more: query.hasNextPage,
    loadingMore: query.isFetchingNextPage,
    loadMore: (): void => {
      background(fetchNextPage(), 'device_log.next_page_failed');
    },
    retry: (): void => {
      background(refetch(), 'device_log.refetch_failed');
    },
  };
}
