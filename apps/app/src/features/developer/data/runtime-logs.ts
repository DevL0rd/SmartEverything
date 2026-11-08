import {
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import {
  API_ENDPOINTS as E,
  type RuntimeLogPage,
  type RuntimeLogRow,
  type RuntimeLogSources,
} from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { useScreenInfiniteQuery, useScreenQuery } from '../../../queries/use-screen-query';

interface LogFilters {
  readonly text: string;
  readonly level: RuntimeLogRow['level'] | 'all';
  readonly source: string | null;
}

interface LogCursor {
  readonly to: string;
  readonly toId: number;
}

const FIRST_PAGE: LogCursor | null = null;

const PAGE_SIZE = 100;

function olderThan(page: RuntimeLogPage): LogCursor | undefined {
  const oldest = page.rows.at(-1);
  return page.more && oldest !== undefined ? { to: oldest.at, toId: oldest.id } : undefined;
}

export function useRuntimeLogs(
  filters: LogFilters,
): UseInfiniteQueryResult<InfiniteData<RuntimeLogPage>> {
  return useScreenInfiniteQuery({
    queryKey: ['developer', 'runtime-logs', filters],
    queryFn: ({ pageParam, signal }) =>
      api().call(
        E.searchRuntimeLogs,
        {
          query: {
            limit: PAGE_SIZE,
            ...(pageParam ?? {}),
            ...(filters.text === '' ? {} : { text: filters.text }),
            ...(filters.level === 'all' ? {} : { level: filters.level }),
            ...(filters.source === null ? {} : { source: filters.source }),
          },
        },
        { signal },
      ),
    initialPageParam: firstPage(),
    getNextPageParam: olderThan,
  });
}

function firstPage(): LogCursor | null {
  return FIRST_PAGE;
}

export function useRuntimeLogSources(): UseQueryResult<RuntimeLogSources> {
  return useScreenQuery({
    queryKey: ['developer', 'runtime-log-sources'],
    queryFn: ({ signal }) => api().call(E.readRuntimeLogSources, {}, { signal }),
  });
}
