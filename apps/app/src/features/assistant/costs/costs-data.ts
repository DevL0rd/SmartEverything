import {
  keepPreviousData,
  type UseInfiniteQueryResult,
  type InfiniteData,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useScreenInfiniteQuery, useScreenQuery } from '../../../queries/use-screen-query';
import {
  AI_USAGE_ENDPOINTS as U,
  type UsageChoices,
  type UsageLedgerPage,
  type UsageSummary,
  type UsageTotals,
} from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { AI_USAGE_PREFIX } from '../../../queries/keys';
import { filterKey, queryOf, type CostFilters } from './costs-params';
import type { CostWindow } from './costs-range';

const LEDGER_PAGE = 30;

export function useCostSummary(
  window: CostWindow,
  filters: CostFilters,
): UseQueryResult<UsageSummary> {
  return useScreenQuery({
    queryKey: [
      ...AI_USAGE_PREFIX,
      'summary',
      window.from,
      window.to,
      window.bucket,
      filterKey(filters),
    ],
    queryFn: () =>
      api().call(U.readUsageSummary, {
        query: { from: window.from, to: window.to, bucket: window.bucket, ...queryOf(filters) },
      }),
    placeholderData: keepPreviousData,
  });
}

export function useCostTotals(
  window: CostWindow,
  filters: CostFilters,
): UseQueryResult<UsageTotals> {
  return useScreenQuery({
    queryKey: [...AI_USAGE_PREFIX, 'totals', window.from, window.to, filterKey(filters)],
    queryFn: () =>
      api().call(U.readUsageTotals, {
        query: { from: window.from, to: window.to, ...queryOf(filters) },
      }),
    placeholderData: keepPreviousData,
  });
}

export function useCostChoices(window: CostWindow): UseQueryResult<UsageChoices> {
  return useScreenQuery({
    queryKey: [...AI_USAGE_PREFIX, 'choices', window.from, window.to],
    queryFn: () => api().call(U.readUsageChoices, { query: { from: window.from, to: window.to } }),
    placeholderData: keepPreviousData,
  });
}

export function useCostLedger(
  window: CostWindow,
  filters: CostFilters,
): UseInfiniteQueryResult<InfiniteData<UsageLedgerPage, string | null>> {
  return useScreenInfiniteQuery<
    UsageLedgerPage,
    Error,
    InfiniteData<UsageLedgerPage, string | null>,
    readonly unknown[],
    string | null
  >({
    queryKey: [...AI_USAGE_PREFIX, 'ledger', window.from, window.to, filterKey(filters)],
    initialPageParam: null,
    queryFn: ({ pageParam }) =>
      api().call(U.listUsageLedger, {
        query: {
          from: window.from,
          to: window.to,
          limit: LEDGER_PAGE,
          ...queryOf(filters),
          ...(pageParam === null ? {} : { cursor: pageParam }),
        },
      }),
    getNextPageParam: (page) => page.next_cursor,
  });
}

export function useTrackedOpenRouterToday(enabled: boolean): UseQueryResult<UsageTotals> {
  const now = new Date();
  const from = `${now.toISOString().slice(0, 10)}T00:00:00.000Z`;
  const to = new Date(Date.parse(from) + 86_400_000).toISOString();
  return useScreenQuery({
    queryKey: [...AI_USAGE_PREFIX, 'openrouter-utc-day', from],
    queryFn: () => api().call(U.readUsageTotals, { query: { from, to, sources: ['openrouter'] } }),
    enabled,
  });
}
