import type { InfiniteData } from '@tanstack/react-query';
import {
  API_ENDPOINTS as E,
  type VacuumClean,
  type VacuumCleanSummary,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { api } from '../../../../api/transport';
import { useScreenInfiniteQuery, useScreenQuery } from '../../../../queries/use-screen-query';
import { CLEANS_PAGE_SIZE, nextCleansCursor } from './cleans-paging';
import { vacuumCleanKey, vacuumCleansKey } from './keys';

async function readCleans(
  deviceId: string,
  before: string | undefined,
): Promise<VacuumCleanSummary[]> {
  const page = await api().call(E.listVacuumCleans, {
    params: { deviceId },
    query: before === undefined ? { limit: CLEANS_PAGE_SIZE } : { before, limit: CLEANS_PAGE_SIZE },
  });
  return page.cleans;
}

export interface VacuumCleansPages {
  readonly cleans: readonly VacuumCleanSummary[];
  readonly loading: boolean;
  readonly failure: Error | null;
  readonly more: boolean;
  readonly loadingMore: boolean;
  readonly loadMore: () => void;
  readonly retry: () => void;
}

export function useVacuumCleans(
  deviceId: string,
  finishedCleans: number | null,
): VacuumCleansPages {
  const query = useScreenInfiniteQuery<
    VacuumCleanSummary[],
    Error,
    InfiniteData<VacuumCleanSummary[]>,
    readonly (string | number | null)[],
    string | undefined
  >({
    queryKey: vacuumCleansKey(deviceId, finishedCleans),
    queryFn: ({ pageParam }) => readCleans(deviceId, pageParam),
    initialPageParam: undefined,
    getNextPageParam: nextCleansCursor,
  });
  const { fetchNextPage, refetch } = query;
  return {
    cleans: (query.data?.pages ?? []).flat(),
    loading: query.isPending,
    failure: query.isError ? query.error : null,
    more: query.hasNextPage,
    loadingMore: query.isFetchingNextPage,
    loadMore: (): void => {
      background(fetchNextPage(), 'vacuum.cleans_next_page_failed', { deviceId });
    },
    retry: (): void => {
      background(refetch(), 'vacuum.cleans_refetch_failed', { deviceId });
    },
  };
}

export interface VacuumCleanState {
  readonly clean: VacuumClean | null;
  readonly loading: boolean;
  readonly failure: Error | null;
}

export function useVacuumClean(deviceId: string, cleanId: string | null): VacuumCleanState {
  const query = useScreenQuery({
    queryKey: vacuumCleanKey(deviceId, cleanId ?? ''),
    queryFn: () => api().call(E.getVacuumClean, { params: { deviceId, cleanId: cleanId ?? '' } }),
    enabled: cleanId !== null,
    staleTime: Infinity,
  });
  return {
    clean: query.data ?? null,
    loading: cleanId !== null && query.isPending,
    failure: query.isError ? query.error : null,
  };
}
